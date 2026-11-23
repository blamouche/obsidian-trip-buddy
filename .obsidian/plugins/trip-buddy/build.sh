#!/bin/sh
# Assemble main.js (Leaflet embarqué + sources) et styles.css. Usage : sh build.sh
cd "$(dirname "$0")"
{
  echo "/* Trip Buddy — fichier généré par build.sh, modifiez plutôt src/*.js */"
  echo "'use strict';"
  echo "const L = (function () { var module = { exports: {} }; var exports = module.exports; var define;"
  cat vendor/leaflet.js
  echo ""
  echo "return module.exports; })();"
  # pdf-lib : exécuté seulement à la première génération de livret
  echo "function TB_loadPdfLib() { if (TB_loadPdfLib.lib) return TB_loadPdfLib.lib; var module = { exports: {} }; var exports = module.exports; var define;"
  cat vendor/pdf-lib.min.js
  echo ""
  echo "TB_loadPdfLib.lib = module.exports; return module.exports; }"
  # fontkit : polices TTF du carnet, chargé à la demande
  echo "function TB_loadFontkit() { if (TB_loadFontkit.lib) return TB_loadFontkit.lib; var module = { exports: {} }; var exports = module.exports; var define;"
  cat vendor/fontkit.min.js
  echo ""
  echo "TB_loadFontkit.lib = module.exports; return module.exports; }"
  for f in src/*.js; do echo ""; cat "$f"; done
} > main.js
{
  echo "/* Trip Buddy — fichier généré par build.sh, modifiez plutôt src/styles.css */"
  sed 's#url(images/[^)]*)#none#g' vendor/leaflet.css
  cat src/styles.css
} > styles.css
echo "main.js $(wc -c < main.js) octets · styles.css $(wc -c < styles.css) octets"
