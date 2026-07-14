-- TempMailMMO — hàm email + OTP cho IOSControl
-- API: https://tempmailmmo.com/docs/index.html

local BASE = "https://tempmailmmo.com/tool/ajax.php"
local H = { ["Content-Type"] = "application/x-www-form-urlencoded" }

-- 1) Tạo email mới → trả { email_addr, sid_token, ... }
function createTempEmail(domain)
    domain = domain or "tempmailmmo.com"
    local body = "email_domain=" .. domain .. "&lang=vi"
    local resp, code = httpPost(BASE .. "?f=get_email_address", body, H, 15)
    if not resp then return nil end
    return jsonDecode(resp)
end

-- 2) Lấy danh sách thư → trả { list = {...}, count = N }
function getEmailList(sid_token)
    local body = "sid_token=" .. sid_token .. "&offset=0"
    local resp, code = httpPost(BASE .. "?f=get_email_list", body, H, 15)
    if not resp then return nil end
    return jsonDecode(resp)
end

-- 2b) Mở lại mailbox cũ → trả { email_addr, sid_token, ... }
function openTempEmail(email_addr)
    local body = "email_addr=" .. email_addr .. "&force_takeover=1&lang=vi"
    local resp, code = httpPost(BASE .. "?f=open_email_address", body, H, 15)
    if not resp then return nil end
    return jsonDecode(resp)
end

-- 3) Đọc chi tiết thư → trả { mail_id, mail_from, mail_subject, mail_body, ... }
function fetchEmail(sid_token, email_id)
    local body = "sid_token=" .. sid_token .. "&email_id=" .. email_id
    local resp, code = httpPost(BASE .. "?f=fetch_email", body, H, 15)
    if not resp then return nil end
    return jsonDecode(resp)
end

-- 4) Xóa thư
function deleteEmail(sid_token, email_id)
    local body = "sid_token=" .. sid_token .. "&email_ids[]=" .. email_id
    local resp, code = httpPost(BASE .. "?f=del_email", body, H, 15)
    if not resp then return false end
    return true
end

-- 5) Đổi username email
function setEmailUser(sid_token, username, domain)
    domain = domain or "tempmailmmo.com"
    local body = "sid_token=" .. sid_token .. "&email_user=" .. username .. "&email_domain=" .. domain
    local resp, code = httpPost(BASE .. "?f=set_email_user", body, H, 15)
    if not resp then return nil end
    return jsonDecode(resp)
end

-- 6) Chờ OTP — poll mỗi 10s, tìm mã số 4-8 digit trong body email
--    Trả OTP string hoặc nil nếu timeout
function waitOTP(sid_token, timeout, digits)
    timeout = timeout or 120
    digits = digits or 6
    local start = os.time()

    while os.time() - start < timeout do
        local list = getEmailList(sid_token)
        if list and list.list then
            for _, item in ipairs(list.list) do
                local detail = fetchEmail(sid_token, item.mail_id)
                if detail and detail.mail_body then
                    -- Strip HTML
                    local text = detail.mail_body:gsub("<[^>]+>", " ")
                    text = text:gsub("&nbsp;", " ")

                    -- Tìm OTP: chuỗi số đúng N digit đứng riêng
                    local pattern = "%f[%d](" .. string.rep("%d", digits) .. ")%f[%D]"
                    local otp = text:match(pattern)
                    if otp then
                        log("[TempMail] OTP: " .. otp)
                        deleteEmail(sid_token, item.mail_id)
                        return otp
                    end
                end
            end
        end

        log("[TempMail] Chờ OTP... " .. (os.time() - start) .. "s/" .. timeout .. "s")
        usleep(10 * 1000000) -- 10 giây
    end

    log("[TempMail] Timeout chờ OTP")
    return nil
end

-- ═══════════════════════════════════════
-- Ví dụ sử dụng:
-- ═══════════════════════════════════════
--[[

-- Tạo email
local session = createTempEmail()
local email = session.email_addr
local token = session.sid_token
log("Email: " .. email)

-- Nhập email vào form...
-- inputText(email)
-- tap(200, 500)

-- Chờ OTP 6 số, tối đa 2 phút
local otp = waitOTP(token, 120, 6)
if otp then
    log("OTP: " .. otp)
    -- inputText(otp)
end

-- Hoặc mở lại mailbox cũ
-- local session = openTempEmail("test@tempmailmmo.com")
-- local list = getEmailList(session.sid_token)

]]--
