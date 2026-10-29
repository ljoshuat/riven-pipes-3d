"""Rebuild riven-pipes-3d.js from src/geometry.js + src/embed.js."""
g = open("src/geometry.js").read()
e = open("src/embed.js").read()
e = e.replace('(function () {\n  "use strict";', '(function () {\n  "use strict";\n  var G = window.RivenPipesG;', 1)
open("riven-pipes-3d.js", "w").write(
    "/* Riven pipe linework (3D) - geometry fitted to the site's line drawing / stock photo camera */\n"
    "(function(){\n" + g + "\nwindow.RivenPipesG = G;\n})();\n" + e)
