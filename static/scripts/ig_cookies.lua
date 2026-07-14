-- Instagram Cookie Extractor — lấy cookies từ Safari binarycookies

function getInstagramCookies()
    local find = execute("find /var/mobile/Containers/Data/Application -path '*/com.apple.mobilesafari/httpstorages.sqlite' 2>/dev/null | head -1")
    local container = find:match("(/var/mobile/Containers/Data/Application/[^/]+)/")
    if not container then
        log("[Cookie] Safari container not found")
        return nil
    end

    local path = container .. "/Library/Cookies/Cookies.binarycookies"
    local f = io.open(path, "rb")
    if not f then
        log("[Cookie] Cannot open: " .. path)
        return nil
    end
    local data = f:read("*a")
    f:close()

    local cookies = {}
    local target = ".instagram.com\0"
    local pos = 1

    while true do
        local i, j = data:find(target, pos, true)
        if not i then break end
        pos = j + 1

        local ne = data:find("\0", pos, true)
        if not ne then break end
        local name = data:sub(pos, ne - 1)
        pos = ne + 1

        local pe = data:find("\0", pos, true)
        if not pe then break end
        pos = pe + 1

        local ve = data:find("\0", pos, true)
        if not ve then break end
        local value = data:sub(pos, ve - 1)
        pos = ve + 1

        if #name > 0 and #name < 50 and name:match("^[%w_]+$") then
            cookies[name] = value
        end
    end

    return cookies
end

function getInstagramCookieString()
    local cookies = getInstagramCookies()
    if not cookies then return nil end
    local parts = {}
    for k, v in pairs(cookies) do
        parts[#parts + 1] = k .. "=" .. v
    end
    return table.concat(parts, "; ")
end

-- Chạy luôn, in JSON ra console
local cookies = getInstagramCookies()
if cookies then
    local keep = {"ig_did","wd","sessionid","mid","ds_user_id","datr","csrftoken"}
    local exp = tostring(os.time() + 365 * 86400)
    local items = {}
    for _, k in ipairs(keep) do
        if cookies[k] then
            items[#items + 1] = '{"domain":".instagram.com","expirationDate":' .. exp .. ',"name":"' .. k .. '","value":"' .. cookies[k] .. '","path":"/"}'
        end
    end
    log("[" .. table.concat(items, ",") .. "]")
else
    log("[Cookie] Không tìm thấy cookies Instagram")
end
