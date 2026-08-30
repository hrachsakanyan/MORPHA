import openslide
from pathlib import Path

files = list(Path("data/wsi").glob("*.svs"))

print("Found:", len(files))

if files:
    slide = openslide.OpenSlide(str(files[0]))

    print("File:", files[0].name)
    print("Dimensions:", slide.dimensions)
    print("Levels:", slide.level_count)

    print("\nImportant metadata:")
    for key in [
        "openslide.mpp-x",
        "openslide.mpp-y",
        "openslide.objective-power",
    ]:
        print(key, "=", slide.properties.get(key))