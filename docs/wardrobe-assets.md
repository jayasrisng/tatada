# Wardrobe image assets

The 13 PNGs in `public/wardrobe/` are individual AI-reconstructed garments made with the built-in image-generation tool, using the former garment crops as edit targets. They replace the old JPG crops. Personal original photos remain in the ignored `outfits/` folder and are not shipped.

These are approximations of visible garments, not recovered exact product patterns. In particular, the red dress reference only shows its upper section: its knee-length skirt is inferred. The figure is a layered 2D outfit preview, not body sizing or a realistic fit simulation.

## Prompt set

For each image the prompt asked to extract and reconstruct only the named garment as a complete, front-facing ghost-mannequin catalog photograph, upright and centered with a small transparent margin. It required a true transparent background; removal of all people, skin, hair, scenery, accessories and other garments; plausible reconstruction of obscured fabric without redesigning visible details; no mannequin, hanger, text labels or background shadow. The pieces are intended to layer on a front-facing dress-up figure.

Specific garment instructions:

- `white-sweater.png`: fuzzy white knit crew-neck sweater, cropped waist length, complete long sleeves angled slightly down.
- `black-nike-top.png`: black long-sleeve crew-neck athletic top, small light-gray swoosh on the wearer's left upper chest; preserve jersey texture and logo placement.
- `converse-tee.png`: black oversized short-sleeve crew-neck tee; preserve the white Converse/Chuck Taylor woodland sign graphic.
- `crochet-top.png`: sleeveless cropped white/pale-blue floral crochet, scalloped flower hem, rounded V neckline; transparent crochet holes; remove sunglasses and jewelry.
- `white-crop-top.png`: only the white fitted cable-knit cropped camisole under the jacket; scoop neck, broad straps, vertical cables, cropped ribbed hem; remove jacket.
- `straight-jeans.png`: medium-dark blue straight-leg cropped jeans, both legs upright and slightly apart, waistband, pockets, seams, folded cuffs; remove shoes.
- `light-jeans.png`: mid-blue relaxed straight-leg high-waisted jeans; waistband, fly, pockets, complete legs and hems; remove jacket, shirt, hands and shoes.
- `black-shorts.png`: black high-waisted fitted stretch shorts with ribbed elastic waistband; preserve proportions and both hems; remove arms and crochet shirt.
- `red-ruffle-dress.png`: bright red dress with ruffled cap sleeves and high round neckline; infer a simple knee-length lightly flared skirt in matching fabric.
- `turquoise-gown.png`: turquoise fitted embroidered bodice, turquoise waist peplum, full white translucent floor-length skirt with large turquoise flowers and green leaves; preserve distinctive design.
- `floral-denim-jacket.png`: cream oversized denim, small pink/blue floral embroidery, pointed collar, flap chest pockets, metal buttons, long sleeves angled down; open front with transparent gap and no shirt/body inside.
- `red-converse.png`: pair of red canvas high-tops, white laces/toe caps/soles, circular ankle patches; toe-forward slight three-quarter view, toes down the frame, heels aligned; remove feet and jeans.
- `white-sneakers.png`: pair of ivory canvas high-tops, beige laces, white rubber toe caps, thin dark sole stripe; toe-forward slight three-quarter view, heels aligned; remove feet and jeans.

## Runtime uploads

Camera/upload is browser-local. Images are resized and re-encoded to remove EXIF. Transparency is preserved for uploaded PNG garment images. Ordinary photos remain reference images and use a color silhouette on the figure; this static app does not perform AI extraction for future uploads. Browser storage has a photo budget, and exports include camera images and kept looks.
