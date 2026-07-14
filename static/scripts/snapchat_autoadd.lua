-- ═══════════════════════════════════════════════════════
-- Snapchat Auto Add Friends — IOSControl
-- ═══════════════════════════════════════════════════════
-- Loop: Read username → Search → Check result → Continue
-- ═══════════════════════════════════════════════════════
--
-- ⚠️  CALIBRATION GUIDE (when switching device model):
--     Lines marked with [CALIBRATE] use absolute point coordinates
--     that are screen-size dependent. Use the Helper tool to re-pick
--     these coordinates on the new device before running.
--     Lines using W*/H* percentages are generally safe across devices.
-- ═══════════════════════════════════════════════════════

local SNAPCHAT_BUNDLE = "com.toyopagroup.picaboo"
local USERNAME_FILE   = "/var/mobile/Library/IOSControl/Scripts/usernames.txt"
local screen = screenSize()
local W = screen.width
local H = screen.height

-- ── HELPERS ──

--- Read all usernames from file
local function loadUsernames()
    local f = io.open(USERNAME_FILE, "r")
    if not f then return nil end
    local lines = {}
    for line in f:lines() do
        line = line:match("^%s*(.-)%s*$") -- trim whitespace
        if line ~= "" then
            table.insert(lines, line)
        end
    end
    f:close()
    if #lines == 0 then return nil end
    return lines
end

--- Overwrite file with remaining usernames (from fromIndex onwards)
local function saveRemaining(list, fromIndex)
    local f = io.open(USERNAME_FILE, "w")
    if not f then return end
    for i = fromIndex, #list do
        f:write(list[i] .. "\n")
    end
    f:close()
end

--- Clear search: tap X button → tap search bar again
local function clearSearch()
    tap(W * 0.93, H * 0.14)  -- [CALIBRATE] X/clear button on search bar
    usleep(1000000)
    tap(W * 0.45, H * 0.13)  -- [CALIBRATE] Search bar center
    usleep(500000)
end

--- Type text via native HID keystrokes (no clipboard/paste) with human-like delay
--- typeKeys is fixed to use gKeyboardClient (safe, does not affect tap)
local function typeHuman(text, minMs, maxMs)
    minMs = minMs or 80
    maxMs = maxMs or 180
    for i = 1, #text do
        typeKeys(text:sub(i, i))  -- HID keystroke, no clipboard
        usleep(math.random(minMs, maxMs) * 1000)
    end
end


-- ── Step 0: Load / create usernames.txt ──
local usernames = loadUsernames()
if not usernames then
    local f = io.open(USERNAME_FILE, "w")
    if f then
        f:write("username1\nusername2\nusername3\n")
        f:close()
    end
    log("📝 Created usernames.txt — add your usernames and run again!")
    toast("📝 Created usernames.txt\nAdd usernames and run again!", 3)
    return
end

log(string.format("📋 Loaded %d usernames", #usernames))

-- ── Step 1: Open Snapchat ──
log("▶ Step 1: Opening Snapchat...")
appRun(SNAPCHAT_BUNDLE)
for i = 1, 5 do usleep(1000000) end

-- ── Step 2: Tap Chat tab (bottom bar) ──
log("▶ Step 2: Tapping Chat tab...")
tap(W * 0.3, H * 0.97)  -- [CALIBRATE] Chat tab in bottom navigation bar
usleep(1500000)

-- ── Step 3: Tap Add Friend icon 👤+ ──
log("▶ Step 3: Tapping Add Friend icon...")
tap(W * 0.83, H * 0.08)  -- [CALIBRATE] Add Friend icon (top-right area of Chat screen)
usleep(2000000)

-- ── Step 4: Loop through each username ──
for i, username in ipairs(usernames) do
    log(string.format("══ [%d/%d] %s ══", i, #usernames, username))
    toast(string.format("[%d/%d] %s", i, #usernames, username), 1)

    -- 4a. Tap search bar
    tap(W * 0.45, H * 0.13)  -- [CALIBRATE] Search bar on Add Friends screen
    usleep(1000000)

    -- 4b. Clear any existing search text
    -- findText returns: x, y, text (found) OR nil (not found)
    local ex, ey = findText("Search...")
    if ex then
        log("  Search bar empty, skip clear")
    else
        log("  Clearing old text...")
        clearSearch()
    end

    -- 4c. Type username via HID keystrokes (no clipboard/paste), human-like delay
    log("  Typing: " .. username)
    typeHuman(username)
    usleep(2000000) -- wait 2s for results (typing adds natural delay)

    -- 4d. Check search results
    -- findText returns nil when text NOT found on screen
    local nx, ny = findText("No results")
    if nx then
        -- User not found → clear and continue
        log("  ❌ No results for: " .. username)
        clearSearch()
    else
        -- User found → wait 1s then check green dot
        usleep(1000000)
        log("  👤 Found user, checking green dot...")

        -- Lock 1 screenshot for consistent color reads
        keepScreen()

        -- Snapchat online indicator color (consistent across devices)
        local GREEN_DOT = 54324

        -- [CALIBRATE] Green dot region for the FIRST result row.
        -- Use Helper → pick the green dot next to first result's avatar → copy region.
        -- Format: {x, y, width, height} in points.
        -- Current calibration: iPhone SE / 414×736pt screen
        local region = {57, 203, 22, 17}
        local found = findColor(GREEN_DOT, 1, region)
        log(string.format("  🔍 Green dot: %d match(es)", found and #found or 0))

        if found and #found > 0 then
            -- User is online → tap yellow Add button
            log("  🟢 User is ONLINE! Tapping Add...")

            -- [CALIBRATE] Yellow Add button region for the FIRST result row.
            -- Use Helper → pick the yellow Add button → copy region.
            -- Format: {x, y, width, height} in points. y=185 is row-1 button top.
            -- Current calibration: iPhone SE / 414×736pt screen
            local addBtn = findColor(16776192, 1, {W * 0.60, 185, W * 0.40, 40})
            releaseScreen()  -- done with this screenshot
            if addBtn and #addBtn > 0 then
                tap(addBtn[1][1], addBtn[1][2])
                log(string.format("  ✅ Tapped Add at (%.0f, %.0f)", addBtn[1][1], addBtn[1][2]))
            else
                tapText("Add", 3)
                log("  ✅ Tapped Add (text fallback)")
            end
            usleep(2000000)
            log("  ✅ Added: " .. username)
            toast("✅ Added: " .. username, 2)
            -- Anti-spam: random delay 75-90s
            local delay = math.random(75, 90)
            log(string.format("  ⏳ Waiting %ds before next...", delay))
            usleep(delay * 1000000)
            -- Clear search for next username
            clearSearch()
        else
            releaseScreen()  -- done with this screenshot
            -- User is offline → skip
            log("  ⚫ User is OFFLINE, skipping...")
            clearSearch()
        end
    end

    -- Save progress: remove processed username from file
    saveRemaining(usernames, i + 1)
end

log("🏁 Done! All usernames processed.")
toast("🏁 All usernames checked!", 3)
