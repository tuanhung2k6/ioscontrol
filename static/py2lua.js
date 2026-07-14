/**
 * py2lua.js — Smart Python to Lua Converter
 * Handles IOSControl API syntax differences  
 * Python automation scripts → Lua automation scripts
 */

const Py2Lua = {
    
    // ═══════════════════════════════════════════
    // Main Convert Function
    // ═══════════════════════════════════════════
    
    convert(pythonCode) {
        if (!pythonCode || !pythonCode.trim()) return '-- Empty script\n';
        
        let lines = pythonCode.split('\n');
        let luaLines = [];
        let indentStack = [0]; // Track indentation for end statements
        let inMultilineString = false;
        let inClass = false;
        let className = '';
        
        // Normalize tabs to 4 spaces
        lines = lines.map(l => l.replace(/\t/g, '    '));
        
        // Detect 2-space indent and normalize to 4-space
        const firstIndent = lines.find(l => l.match(/^( +)\S/));
        if (firstIndent) {
            const spaces = firstIndent.match(/^( +)/)[1].length;
            if (spaces === 2) {
                lines = lines.map(l => {
                    const m = l.match(/^( +)/);
                    if (m) return '    '.repeat(m[1].length / 2) + l.trimStart();
                    return l;
                });
            }
        }
        
        // Header
        luaLines.push('-- Converted from Python by IOSControl');
        luaLines.push('-- ' + new Date().toISOString().slice(0, 19));
        luaLines.push('');
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            let trimmed = line.trim();
            
            // Skip empty lines
            if (trimmed === '') {
                luaLines.push('');
                continue;
            }
            
            // Skip Python-only imports
            if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
                let mod = trimmed.replace(/^(import|from)\s+/, '').split(/\s/)[0];
                // Keep as comment for reference
                if (['random', 'math', 'time', 'json', 'os', 'sys'].includes(mod)) {
                    luaLines.push(`-- ${trimmed} (built-in in Lua/IOSControl)`);
                } else {
                    luaLines.push(`-- ${trimmed}`);
                }
                continue;
            }
            
            // Calculate current indent
            let indent = line.search(/\S/);
            if (indent < 0) indent = 0;
            let luaIndent = '    '.repeat(Math.floor(indent / 4));
            
            // Close blocks when indent decreases
            // Skip auto-close for except/finally — they handle their own closure
            let isTryRelated = /^(except|finally)/.test(trimmed);
            while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1] && trimmed !== '' && !isTryRelated) {
                indentStack.pop();
                let closeIndent = '    '.repeat(Math.floor(indentStack[indentStack.length - 1] / 4));
                luaLines.push(closeIndent + 'end');
            }
            // For except/finally, just pop the indent without emitting end
            if (isTryRelated) {
                while (indentStack.length > 1 && indent < indentStack[indentStack.length - 1]) {
                    indentStack.pop();
                }
            }
            
            // Comments
            if (trimmed.startsWith('#')) {
                luaLines.push(luaIndent + '--' + trimmed.slice(1));
                continue;
            }
            
            // Convert the line
            let converted = this.convertLine(trimmed, luaIndent, lines, i);
            
            // Track blocks that need 'end'
            if (this.opensBlock(trimmed)) {
                indentStack.push(indent + 4);
            }
            
            luaLines.push(converted);
        }
        
        // Close remaining blocks
        while (indentStack.length > 1) {
            indentStack.pop();
            let closeIndent = '    '.repeat(Math.floor(indentStack[indentStack.length - 1] / 4));
            luaLines.push(closeIndent + 'end');
        }
        
        return luaLines.join('\n');
    },
    
    // ═══════════════════════════════════════════
    // Line-by-line Conversion
    // ═══════════════════════════════════════════
    
    convertLine(line, indent, allLines, lineIndex) {
        let result = line;
        
        // ── 1. Function definitions ──
        if (/^def\s+/.test(result)) {
            result = result.replace(/^def\s+(\w+)\s*\((.*?)\)\s*:/, (_, name, params) => {
                params = this.convertParams(params);
                return `function ${name}(${params})`;
            });
            return indent + result;
        }
        
        // ── 2. Class definitions ──
        if (/^class\s+/.test(result)) {
            result = result.replace(/^class\s+(\w+).*?:/, (_, name) => {
                return `-- class ${name}`;
            });
            return indent + result;
        }
        
        // ── 3. If/elif/else ──
        if (/^if\s+/.test(result)) {
            result = result.replace(/^if\s+(.*?)\s*:$/, (_, cond) => {
                return `if ${this.convertCondition(cond)} then`;
            });
            return indent + result;
        }
        if (/^elif\s+/.test(result)) {
            // Need to insert 'end' before elseif? No — Lua uses elseif without end
            result = result.replace(/^elif\s+(.*?)\s*:$/, (_, cond) => {
                return `elseif ${this.convertCondition(cond)} then`;
            });
            return indent + result;
        }
        if (/^else\s*:/.test(result)) {
            return indent + 'else';
        }
        
        // ── 4. For loops ──
        if (/^for\s+/.test(result)) {
            // for i in range(n)
            let rangeMatch = result.match(/^for\s+(\w+)\s+in\s+range\((.+?)\)\s*:/);
            if (rangeMatch) {
                let [_, varName, rangeArgs] = rangeMatch;
                let args = rangeArgs.split(',').map(a => a.trim());
                if (args.length === 1) {
                    return indent + `for ${varName} = 0, ${args[0]} - 1 do`;
                } else if (args.length === 2) {
                    return indent + `for ${varName} = ${args[0]}, ${args[1]} - 1 do`;
                } else {
                    return indent + `for ${varName} = ${args[0]}, ${args[1]} - 1, ${args[2]} do`;
                }
            }
            // for item in list
            let iterMatch = result.match(/^for\s+(\w+)\s+in\s+(.+?)\s*:/);
            if (iterMatch) {
                let [_, varName, iterable] = iterMatch;
                iterable = this.convertExpr(iterable);
                return indent + `for _, ${varName} in ipairs(${iterable}) do`;
            }
            // for k, v in dict.items()
            let dictMatch = result.match(/^for\s+(\w+),\s*(\w+)\s+in\s+(\w+)\.items\(\)\s*:/);
            if (dictMatch) {
                let [_, k, v, dict] = dictMatch;
                return indent + `for ${k}, ${v} in pairs(${dict}) do`;
            }
        }
        
        // ── 5. While loops ──
        if (/^while\s+/.test(result)) {
            result = result.replace(/^while\s+(.*?)\s*:$/, (_, cond) => {
                return `while ${this.convertCondition(cond)} do`;
            });
            return indent + result;
        }
        
        // ── 6. Try/except → pcall ──
        if (/^try\s*:/.test(result)) {
            return indent + 'local ok, err = pcall(function()';
        }
        if (/^except/.test(result)) {
            let excMatch = result.match(/^except\s+(\w+)\s+as\s+(\w+)\s*:/);
            if (excMatch) {
                return indent + `end)\nif not ok then`;
            }
            return indent + 'end)\n' + indent + 'if not ok then';
        }
        if (/^finally\s*:/.test(result)) {
            return indent + 'end\n' + indent + '-- finally';
        }
        
        // ── 7. Return ──
        if (/^return\s+/.test(result)) {
            result = result.replace(/^return\s+(.*)/, (_, expr) => {
                return `return ${this.convertExpr(expr)}`;
            });
            return indent + result;
        }
        
        // ── 8. Print → log ──
        result = result.replace(/^print\s*\((.*)\)$/, (_, args) => {
            return `log(${this.convertExpr(args)})`;
        });
        
        // ── 9. Variable assignment ──
        if (/^\w+\s*=\s*/.test(result) && !/^(if|while|for|def|class|return)/.test(result)) {
            // Check if it's augmented assignment
            result = result.replace(/^(\w+)\s*\+=\s*(.+)/, (_, v, expr) => {
                return `${v} = ${v} + ${this.convertExpr(expr)}`;
            });
            result = result.replace(/^(\w+)\s*-=\s*(.+)/, (_, v, expr) => {
                return `${v} = ${v} - ${this.convertExpr(expr)}`;
            });
            result = result.replace(/^(\w+)\s*\*=\s*(.+)/, (_, v, expr) => {
                return `${v} = ${v} * ${this.convertExpr(expr)}`;
            });
            
            // Local variable (first assignment in scope)
            if (/^\w+\s*=\s*/.test(result) && !result.includes('.')) {
                result = result.replace(/^(\w+)\s*=\s*(.+)/, (_, v, expr) => {
                    return `local ${v} = ${this.convertExpr(expr)}`;
                });
            }
        }
        
        // ── 10. IOSControl API conversions ──
        result = this.convertAPICalls(result);
        
        // ── 11. General Python → Lua syntax ──
        result = this.convertGeneralSyntax(result);
        
        // Remove trailing colon (from any unconverted Python blocks)
        result = result.replace(/:\s*$/, '');
        
        return indent + result;
    },
    
    // ═══════════════════════════════════════════
    // API Call Conversions
    // ═══════════════════════════════════════════
    
    convertAPICalls(line) {
        // Python snake_case → Lua camelCase for IOSControl APIs
        const apiMap = {
            // Touch
            'touch_down': 'touchDown',
            'touch_move': 'touchMove', 
            'touch_up': 'touchUp',
            'long_press': 'longPress',
            // Color
            'get_color': 'getColor',
            'get_colors': 'getColors',
            'find_color': 'findColor',
            'find_colors': 'findColors',
            'find_image': 'findImage',
            'wait_for_color': 'waitForColor',
            'wait_for_image': 'waitForImage',
            'wait_for_text': 'waitForText',
            // App
            'app_run': 'appRun',
            'app_kill': 'appKill',
            'app_clear': 'appClear',
            'app_state': 'appState',
            'front_most_app': 'frontMostApp',
            'open_url': 'openURL',
            // Input
            'input_text': 'inputText',
            'key_down': 'keyDown',
            'key_up': 'keyUp',
            'copy_text': 'setClipboard',
            'clip_text': 'getClipboard',
            // Screen
            'get_screen_resolution': 'screenInfo',
            'get_orientation': 'getOrientation',
            'tap_image': 'tapImage',
            // OCR
            'ocr_text': 'ocrText',
            'ocr_find': 'ocrFind',
            // HTTP
            'http_get': 'httpGet',
            'http_post': 'httpPost',
            // Device
            'device_info': 'deviceInfo',
            'wifi_info': 'wifiInfo',
            'get_device_info': 'deviceInfo',
            'get_sn': 'getSerialNumber',
            // Utility
            'random_int': 'randomInt',
            'random_float': 'randomFloat',
            'random_sleep': 'randomSleep',
            // Scheduler
            'schedule_after': 'scheduleAfter',
            'on_notification': 'onNotification',
        };
        
        for (const [py, lua] of Object.entries(apiMap)) {
            // Match function calls (word boundary)
            let regex = new RegExp(`\\b${py}\\s*\\(`, 'g');
            line = line.replace(regex, `${lua}(`);
        }
        
        // Python get/post → Lua httpGet/httpPost  
        line = line.replace(/\bget\s*\(\s*["'](https?:)/g, 'httpGet("$1');
        line = line.replace(/\bpost\s*\(\s*["'](https?:)/g, 'httpPost("$1');
        
        return line;
    },
    
    // ═══════════════════════════════════════════
    // General Syntax Conversion
    // ═══════════════════════════════════════════
    
    convertGeneralSyntax(line) {
        // True/False/None → true/false/nil
        line = line.replace(/\bTrue\b/g, 'true');
        line = line.replace(/\bFalse\b/g, 'false');
        line = line.replace(/\bNone\b/g, 'nil');
        
        // not/and/or (already Lua-compatible, but Python's != needs fixing)
        line = line.replace(/\bNot\b/g, 'not');
        line = line.replace(/!=/g, '~=');
        
        // ** → ^
        line = line.replace(/\*\*/g, '^');
        
        // len(x) → #x
        line = line.replace(/\blen\s*\(\s*(\w+)\s*\)/g, '#$1');
        
        // f-strings → string.format or concatenation
        line = this.convertFStrings(line);
        
        // str(x) → tostring(x)
        line = line.replace(/\bstr\s*\(/g, 'tostring(');
        
        // int(x) → math.floor(tonumber(x))
        line = line.replace(/\bint\s*\(/g, 'math.floor(tonumber(');
        // Close extra paren - simple heuristic
        if (line.includes('math.floor(tonumber(')) {
            line = line.replace(/math\.floor\(tonumber\(([^)]+)\)\)/, 'math.floor(tonumber($1))');
        }
        
        // float(x) → tonumber(x)
        line = line.replace(/\bfloat\s*\(/g, 'tonumber(');
        
        // isinstance → type check
        line = line.replace(/\bisinstance\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, 'type($1) == "$2"');
        
        
        // Python list [] → Lua table {}
        // Empty list
        line = line.replace(/\[\s*\]/g, '{}');
        // List with content: ["a", "b"] → {"a", "b"} 
        // But NOT dict access like d["key"] — only match when = precedes or start of expression
        line = line.replace(/(=\s*)\[([^\]]+)\]/g, (_, prefix, content) => {
            return prefix + '{' + content + '}';
        });
        
        // Python dict {} stays as {} in Lua (but keys differ)
        // Python dict access: d["key"] stays same in Lua
        
        // .append(x) → table.insert(t, x)
        line = line.replace(/(\w+)\.append\s*\((.+?)\)/g, 'table.insert($1, $2)');
        
        // .pop() → table.remove(t)
        line = line.replace(/(\w+)\.pop\s*\(\)/g, 'table.remove($1)');
        
        // .upper() → string.upper()
        line = line.replace(/(\w+)\.upper\s*\(\)/g, 'string.upper($1)');
        line = line.replace(/(\w+)\.lower\s*\(\)/g, 'string.lower($1)');
        
        // .strip() → trim (custom or string.gsub)
        line = line.replace(/(\w+)\.strip\s*\(\)/g, '$1:match("^%s*(.-)%s*$")');
        
        // .split(s) → (custom split)
        // Keep as is, add comment
        
        // .format() → string.format (basic)
        line = line.replace(/"([^"]*)"\.format\s*\((.+?)\)/g, 'string.format("$1", $2)');
        
        // .join() → table.concat
        line = line.replace(/"([^"]*)"\.join\s*\(\s*(\w+)\s*\)/g, 'table.concat($2, "$1")');
        
        // random.randint(a, b) → math.random(a, b)
        line = line.replace(/random\.randint\s*\(/g, 'math.random(');
        
        // random.uniform(a, b) → a + math.random() * (b - a)
        line = line.replace(/random\.uniform\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)/g, 
                            '$1 + math.random() * ($2 - $1)');
        
        // random.choice(list) → list[math.random(#list)]
        line = line.replace(/random\.choice\s*\(\s*(\w+)\s*\)/g, '$1[math.random(#$1)]');
        
        // time.sleep → sleep (already available in IOSControl)
        line = line.replace(/time\.sleep\s*\(/g, 'sleep(');
        
        // math.floor, math.ceil, math.sqrt (same in Lua!)
        // json.loads → jsonDecode, json.dumps → jsonEncode
        line = line.replace(/json\.loads\s*\(/g, 'jsonDecode(');
        line = line.replace(/json\.dumps\s*\(/g, 'jsonEncode(');
        
        // os.path operations → Lua equivalents
        line = line.replace(/os\.path\.exists\s*\(/g, '-- os.path.exists(');
        
        return line;
    },
    
    // ═══════════════════════════════════════════
    // F-string Conversion
    // ═══════════════════════════════════════════
    
    convertFStrings(line) {
        // f"text {expr}" → "text " .. tostring(expr)
        return line.replace(/f"([^"]*?)"/g, (match, content) => {
            let parts = [];
            let lastIndex = 0;
            let regex = /\{([^}]+)\}/g;
            let m;
            
            while ((m = regex.exec(content)) !== null) {
                if (m.index > lastIndex) {
                    parts.push(`"${content.slice(lastIndex, m.index)}"`);
                }
                // Convert the expression inside {}
                let expr = m[1];
                // Handle format specs like :06X
                if (expr.includes(':')) {
                    let [varPart, fmt] = expr.split(':');
                    if (fmt === '06X') {
                        parts.push(`string.format("0x%06X", ${varPart})`);
                    } else if (fmt.includes('d') || fmt.includes('f')) {
                        parts.push(`string.format("%${fmt}", ${varPart})`);
                    } else {
                        parts.push(`tostring(${varPart})`);
                    }
                } else {
                    parts.push(`tostring(${expr})`);
                }
                lastIndex = m.index + m[0].length;
            }
            
            if (lastIndex < content.length) {
                parts.push(`"${content.slice(lastIndex)}"`);
            }
            
            return parts.join(' .. ') || '""';
        });
        
        // Also handle f'...' (single quotes)
        // Lua uses double quotes or single quotes equally
    },
    
    // ═══════════════════════════════════════════
    // Helper Functions
    // ═══════════════════════════════════════════
    
    convertCondition(cond) {
        cond = cond.replace(/!=/g, '~=');
        cond = cond.replace(/\bTrue\b/g, 'true');
        cond = cond.replace(/\bFalse\b/g, 'false');
        cond = cond.replace(/\bNone\b/g, 'nil');
        cond = cond.replace(/\bnot\s+/g, 'not ');
        cond = cond.replace(/\bin\b/g, '~='); // basic, not perfect
        // x is None → x == nil
        cond = cond.replace(/(\w+)\s+is\s+None/g, '$1 == nil');
        cond = cond.replace(/(\w+)\s+is\s+not\s+None/g, '$1 ~= nil');
        return cond;
    },
    
    convertParams(params) {
        // Remove type annotations: x: int → x
        params = params.replace(/:\s*\w+(\s*=)?/g, (m, eq) => eq ? ' =' : '');
        // Default params: x=5 stays as is in Lua
        return params;
    },
    
    convertExpr(expr) {
        expr = this.convertGeneralSyntax(expr);
        expr = this.convertAPICalls(expr);
        return expr;
    },
    
    opensBlock(line) {
        return /^(def |if |elif |else|for |while |class |try\s*:|except)/.test(line.trim()) 
            && line.trim().endsWith(':');
    },
    
    // ═══════════════════════════════════════════
    // Quick Convert UI Helper
    // ═══════════════════════════════════════════
    
    getStats(pythonCode, luaCode) {
        let pyLines = pythonCode.split('\n').filter(l => l.trim()).length;
        let luaLines = luaCode.split('\n').filter(l => l.trim()).length;
        let apiCalls = (luaCode.match(/\b(tap|swipe|getColor|findColor|findImage|appRun|httpGet|ocrText|sleep|log)\s*\(/g) || []).length;
        return { pyLines, luaLines, apiCalls };
    }
};

// Export for use in app.js
window.Py2Lua = Py2Lua;
