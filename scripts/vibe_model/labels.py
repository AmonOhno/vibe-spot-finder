"""Open Images の画像レベルラベル（DisplayName）と Vibe の対応表。"""

VIBE_IDS = ['ocean', 'forest', 'sunset', 'night', 'snow', 'retro', 'vivid']

VIBE_CLASSES = {
    'ocean': ['Sea', 'Ocean', 'Beach', 'Coast', 'Shore', 'Bay', 'Lagoon', 'Lake', 'Wind wave', 'Cape',
              'Headland', 'Promontory', 'Islet', 'Tropics', 'Underwater'],
    'forest': ['Forest', 'Woodland', 'Jungle', 'Old-growth forest', 'Grove', 'Bamboo', 'Nature reserve',
               'Tropical and subtropical coniferous forests', 'Temperate broadleaf and mixed forest',
               'Spruce-fir forest', 'Northern hardwood forest'],
    'sunset': ['Sunset', 'Sunrise', 'Dusk', 'Dawn', 'Afterglow', 'Red sky at morning', 'Evening'],
    'night': ['Night', 'Neon', 'Neon sign', 'Midnight', 'Fireworks', 'Christmas lights'],
    'snow': ['Snow', 'Winter storm', 'Blizzard', 'Freezing', 'Frost', 'Glacier', 'Ice cap', 'Polar ice cap',
             'Arctic', 'Winter sport', 'Ski resort'],
    'retro': ['Vintage clothing', 'Retro style', 'Antique', 'Vintage car', 'Monochrome photography',
              'Monochrome', 'Black-and-white', 'Historic site', 'Japanese architecture', 'Cobblestone'],
    'vivid': ['Colorfulness', 'Graffiti', 'Rainbow', 'Amusement park', 'Street art', 'Carnival', 'Magenta',
              'Tints and shades'],
}
