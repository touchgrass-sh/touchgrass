-- GIF style (sudo): light = paper white, dark = terminal dark, NULL = suits both (GIFs the owner forwards).
ALTER TABLE gifs ADD COLUMN theme TEXT;
-- The built-in set uploaded so far is the dark one.
UPDATE gifs SET theme = 'dark' WHERE tags != '';
