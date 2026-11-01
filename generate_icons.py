import zlib
import struct
import math

def create_png(width, height, filename, maskable=False):
    # Generates a PNG icon with an agentic glowing robot/brain glyph
    raw_data = bytearray()
    
    center_x = width / 2
    center_y = height / 2
    radius = (min(width, height) / 2) * (0.85 if not maskable else 0.7)
    
    for y in range(height):
        # Filter type 0 (None)
        raw_data.append(0)
        for x in range(width):
            dx = x - center_x
            dy = y - center_y
            dist = math.sqrt(dx * dx + dy * dy)
            
            # Background: Deep tech gradient (#090d16 to #1e1b4b)
            ny = y / height
            r = int(9 + (30 - 9) * ny)
            g = int(13 + (27 - 13) * ny)
            b = int(22 + (75 - 22) * ny)
            a = 255
            
            # Subtle outer glow / circle
            if dist <= radius:
                # Add cyan/indigo neon gradient
                glow = 1.0 - (dist / radius)
                # Outer border
                if abs(dist - radius) < (width * 0.03):
                    r = int(99)
                    g = int(102)
                    b = int(241) # Indigo #6366f1
                elif dist < radius * 0.8:
                    # Central icon glyph (AI Spark / Agent Diamond)
                    norm_x = abs(dx) / (radius * 0.7)
                    norm_y = abs(dy) / (radius * 0.7)
                    # 4-point star shape: norm_x^0.6 + norm_y^0.6 <= 0.9
                    if (norm_x**0.6 + norm_y**0.6) <= 0.8:
                        # Bright cyan/emerald core
                        r = int(16 + (56 - 16) * glow)
                        g = int(185 + (230 - 185) * glow)
                        b = int(129 + (255 - 129) * glow)
                    elif (norm_x**0.6 + norm_y**0.6) <= 0.95:
                        # Cyan outline
                        r = 99
                        g = 102
                        b = 241
            
            raw_data.extend([r, g, b, a])
            
    # PNG Header
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data) & 0xffffffff
    png.extend(struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc))
    
    # IDAT
    compressed = zlib.compress(bytes(raw_data), 9)
    idat_crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
    png.extend(struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc))
    
    # IEND
    iend_crc = zlib.crc32(b'IEND') & 0xffffffff
    png.extend(struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc))
    
    with open(filename, 'wb') as f:
        f.write(png)
    print(f"Generated {filename} ({width}x{height})")

create_png(192, 192, "icon-192.png")
create_png(512, 512, "icon-512.png")
create_png(512, 512, "icon-maskable-512.png", maskable=True)
create_png(96, 96, "favicon.png")

