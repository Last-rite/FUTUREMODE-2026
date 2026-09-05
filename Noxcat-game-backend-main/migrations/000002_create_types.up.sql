CREATE TYPE player_role AS ENUM ('player', 'admin');
CREATE TYPE player_status AS ENUM ('idle', 'in_combat', 'trading');
CREATE TYPE unit_species AS ENUM ('generic', 'fire', 'wind', 'water');
CREATE TYPE trade_status AS ENUM ('pending', 'accepted', 'rejected');
