"use strict";
// manages cache for require hooks
var fs = require('fs');
var sourceMaps = require('./sourceMaps');
var version = require('../package').version;

function cacheRoot(options) {
	if (options.cacheDir) return options.cacheDir;
	if (process.env.HOME === undefined && process.env.HOMEDRIVE === undefined) throw new Error("HOME not found, unable to store Streamline callback cache");
	return (process.env.HOME || (process.env.HOMEDRIVE + process.env.HOMEPATH).replace(/\\/g, '/')) + "/.streamline";
}

var dirMode = parseInt('777', 8);

function mkdirsSync(path) {
	var p = "",
		i = 0;
	var segs = path.split('/').slice(0, -1);
	while (i < segs.length) {
		var seg = segs[i];
		p += (i++ ? '/' : '') + seg;
		if (!fs.existsSync(p)) {
			try {
				fs.mkdirSync(p, dirMode);
			} catch(err) {
				if (i > 1 && err.code !== 'EEXIST') {
					throw err;
				}
			}
		}
	}
}

function mtimeSync(fname) {
	return fs.existsSync(fname) ? fs.statSync(fname).mtime : 0;
}

function subdir(options) {
	var d = options.runtime;
	if (options.aggressive) d += '-aggressive';
	d += "-" + version;
	return d;
}

exports.get = function(path, options, transform) {
	var result;
	if (!options.cache) {
		result = transform();
		if (result.map && !result.map.mappings) throw new Error(path + ": empty source map");
		if (result.map) sourceMaps.put(path, null, result.map);
		return result;
	}
	path = path.replace(/\\/g, '/');

	var i = path.indexOf('node_modules/');
	if (i < 0) i = path.lastIndexOf('/');
	else i += 'node_modules'.length;

	var dir = cacheRoot(options) + '/' + subdir(options);
	dir += '/' + path.substring(0, i).replace(/[\/\:]/g, '__');
	var f = dir + path.substring(i);
	mkdirsSync(f);
	var mapPath = f.replace(/(\.\w+)?$/, '.map');
	if (!options.force && mtimeSync(f) > mtimeSync(path)) {
		if (!(options.ignore && options.ignore(path))) sourceMaps.put(path, mapPath);
		return {
			code: fs.readFileSync(f, "utf8"),
			map: options.sourceMaps ? sourceMaps.get(path) : null,
		};
	}
	var result = transform();
	fs.writeFileSync(f, result.code, "utf8");
	if (result.map && !result.map.mappings) throw new Error(path + ": empty source map");
	if (result.map) {
		// write map to cache instead of keeping it in memory (maps are only needed for stack traces)
		sourceMaps.put(path, mapPath);
		if (result.map) fs.writeFileSync(mapPath, JSON.stringify(result.map, null, '\t'), "utf8");
	}
	return result;
}