-- Instagram 2FA Enable — bật xác thực 2 yếu tố qua API
-- Cần: ig_cookies.lua (dofile trước)

-- Base32 decode → hex string
local b32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
function base32ToHex(input)
    input = input:upper():gsub("[= ]", "")
    local bits = ""
    for i = 1, #input do
        local idx = b32chars:find(input:sub(i,i), 1, true) - 1
        for b = 4, 0, -1 do
            bits = bits .. ((idx >> b) & 1)
        end
    end
    local hex = ""
    for i = 1, #bits - 7, 8 do
        hex = hex .. string.format("%02x", tonumber(bits:sub(i, i+7), 2))
    end
    return hex
end

-- TOTP 6-digit code từ Base32 seed (dùng openssl trên device)
function generateTOTP(seed)
    local keyHex = base32ToHex(seed)
    local counter = math.floor(os.time() / 30)
    local timeHex = string.format("%016x", counter)

    -- Build printf escape
    local esc = timeHex:gsub("(%x%x)", "\\x%1")
    local cmd = 'printf "' .. esc .. '" | openssl dgst -sha1 -mac HMAC -macopt hexkey:' .. keyHex .. ' 2>/dev/null'
    local result = execute(cmd)
    local hmac = result:match("(%x+)%s*$")
    if not hmac or #hmac < 40 then
        log("[2FA] openssl HMAC failed: " .. tostring(result))
        return nil
    end

    -- Dynamic truncation (RFC 4226)
    local offset = tonumber(hmac:sub(40, 40), 16) * 2 + 1
    local code = tonumber(hmac:sub(offset, offset + 7), 16) & 0x7FFFFFFF
    return string.format("%06d", code % 1000000)
end

-- Bật 2FA Instagram
function enableInstagram2FA()
    local cookies = getInstagramCookies()
    if not cookies or not cookies.sessionid then
        log("[2FA] Chưa login Instagram trên Safari")
        return nil
    end

    local cookieStr = getInstagramCookieString()
    local csrf = cookies.csrftoken or ""
    local uid = cookies.ds_user_id or ""

    local headers = {
        ["Cookie"] = cookieStr,
        ["X-CSRFToken"] = csrf,
        ["X-IG-App-ID"] = "936619743392459",
        ["X-Requested-With"] = "XMLHttpRequest",
        ["User-Agent"] = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        ["Content-Type"] = "application/x-www-form-urlencoded",
    }

    -- Bước 1: Lấy seed
    log("[2FA] Generating seed...")
    local resp1, code1 = httpPost(
        "https://www.instagram.com/api/v1/accounts/generate_two_factor_seed/",
        "", headers, 15
    )
    if not resp1 then
        log("[2FA] generate_seed request failed")
        return nil
    end

    local data1 = jsonDecode(resp1)
    if not data1 or not data1.totp_seed then
        log("[2FA] No seed: " .. tostring(resp1):sub(1, 300))
        return nil
    end

    local seed = data1.totp_seed
    log("[2FA] Seed: " .. seed)

    -- Bước 2: Tạo mã TOTP
    local totpCode = generateTOTP(seed)
    if not totpCode then
        log("[2FA] TOTP generation failed")
        return nil
    end
    log("[2FA] Code: " .. totpCode)

    -- Bước 3: Bật 2FA
    log("[2FA] Enabling 2FA...")
    local resp2, code2 = httpPost(
        "https://www.instagram.com/api/v1/accounts/enable_totp_two_factor/",
        "verification_code=" .. totpCode,
        headers, 15
    )
    if not resp2 then
        log("[2FA] enable request failed")
        return nil
    end

    local data2 = jsonDecode(resp2)
    log("[2FA] Response: " .. tostring(resp2):sub(1, 500))

    if data2 and data2.backup_codes then
        log("[2FA] ✅ 2FA enabled!")
        log("[2FA] Seed: " .. seed)
        log("[2FA] Backup codes: " .. jsonEncode(data2.backup_codes))
        return { seed = seed, backup_codes = data2.backup_codes }
    else
        log("[2FA] ❌ Enable failed")
        return nil
    end
end

-- Chạy
dofile(currentDir() .. "/ig_cookies.lua")
enableInstagram2FA()
