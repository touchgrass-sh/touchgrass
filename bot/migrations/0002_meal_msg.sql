-- Which Telegram message shows each meal, so replying to it corrects that meal.
ALTER TABLE meals ADD COLUMN msg_id INTEGER;
