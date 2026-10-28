-- sudo pack: coffees live in `meals` (their kcal count toward the day) but aren't meals.
-- kind: NULL = meal, 'coffee' = a logged coffee (items[0].caf = caffeine mg).
ALTER TABLE meals ADD COLUMN kind TEXT;
