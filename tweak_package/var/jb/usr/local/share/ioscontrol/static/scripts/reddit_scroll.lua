-- Reddit Auto Scroll — IOSControl native functions
sleep(5)

local start = os.time()
local duration = (20 + randomInt(0, 5)) * 60
local cycle = 0

while (os.time() - start) < duration do
    cycle = cycle + 1

    -- Mỗi 8 cycle tap refresh/home
    if cycle % 8 == 0 then
        tap(37, 648)
        sleep(1.5)
    end

    -- Swipe lên 1-3 lần
    local swipes = randomInt(1, 3)
    for i = 1, swipes do
        local x = 187
        local startY = randomInt(400, 520)
        local distance = randomInt(350, 550)
        local endY = startY - distance
        if endY < 60 then endY = 60 end
        swipe(x, startY, x, endY, 18)
        randomSleep(20000, 60000) -- 20-60ms
    end

    -- Dừng ngẫu nhiên giả lập đọc
    local r = randomFloat(0, 1)
    if r < 0.5 then
        randomSleep(200000, 700000)    -- 0.2-0.7s
    elseif r < 0.8 then
        randomSleep(800000, 1800000)   -- 0.8-1.8s
    else
        randomSleep(2000000, 4000000)  -- 2-4s
    end

    -- 8% chance dừng lâu (đọc bài dài)
    if randomInt(1, 100) <= 8 then
        randomSleep(10000000, 25000000) -- 10-25s
    end
end

vibrate()
sleep(0.5)
vibrate()
sleep(0.5)
vibrate()
toast("Reddit session done! Switch account and restart.", 3)
