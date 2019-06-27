var exec = require("child_process").exec;
var util = require("util");

var argc = process.argv.length;
var realCommand = process.argv.splice(2, argc).join(" ");
var command = realCommand;
var results = {};
var total = 0, done = 0;

var display_handlers = {};

if(argc < 3) {
	console.log("Usage : gitr <command>");
	return false;
}

var aliases = {
	"stat": "status"
};

if(typeof aliases[command] != "undefined") {
	command = aliases[command];
}

// https://github.com/uxitten/polyfill/blob/master/string.polyfill.js
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/repeat
if (!String.prototype.padEnd) {
    String.prototype.padEnd = function padEnd(targetLength,padString) {
        targetLength = targetLength>>0; //floor if number or convert non-number to 0;
        padString = String(padString || ' ');
        if (this.length > targetLength) {
            return String(this);
        }
        else {
            targetLength = targetLength-this.length;
            if (targetLength > padString.length) {
                padString += padString.repeat(targetLength/padString.length); //append to original to ensure we are longer than needed
            }
            return String(this) + padString.slice(0,targetLength);
        }
    };
}

if (!String.prototype.repeat) {
	String.prototype.repeat = function repeat(length) {
		var ret = "", append = String(this);
		for(var i = 0; i < length; i++) {
			ret += append
		}
		return ret;
	}
}

var Requester = (function() {
	var _this = {};
	var currentPool = [];
	var waitingPool = [];
	var maxConcurrent = 8;
	
	var _busy = false;
	var finishCallback = function(index) {
		if(_busy) {
			return false;
		}
		_busy = true;
		
		delete currentPool[index];
		currentPool = currentPool.filter(function(a) { return a; });
		
		if(waitingPool.length > 0) {
			var newOne = waitingPool.shift();
			currentPool.push(newOne);
			run(newOne);
		}
		
		_busy = false;
		return true;
	};
	
	var run = function(request) {
		request.callback.apply(null, request.params);
	};
	
	_this.add = function(cb, args) {
		var r = { callback: cb, params: args };
		r.params.push(function() {
			while(!finishCallback(currentPool.indexOf(r))) {}
		});
		
		if(currentPool.length < maxConcurrent) {
			currentPool.push(r);
			run(r);
		}
		else {
			waitingPool.push(r);
		}
	};
	
	return _this;
})();

/* Remove last element to get the directory */

String.prototype.toDir = function() {
	var a = this.split("/");
	a.pop();
	return a.join("/");
};

/* Sort object by keys */

function sort_associative_array(arr) {
	var keys = Object.keys(arr);
	var res = {};
	
	keys.sort();
	
	for(var i = 0, size = keys.length; i < size; i++) {
		k = keys[i];
		res[k] = arr[k];
	}

	return res;
}

/* Display results */

function display_results(data) {
	data = sort_associative_array(data);
	if(typeof display_handlers[command] == "function") {
		display_handlers[command](data);
	}
	else {
		for(var k in data) {
			console.log(" o----------------------------------------------------------------------------------------------------");
			console.log(" | ");
			console.log(" |\t\t\tgit " + command + " " + k);
			console.log(" | ");
			console.log(data[k].stdout);
		}
	}
}

/* Execute the requested git command in that directory */

function git_exec(directory, callback) {
	exec('git -C ' + directory + ' ' + command, function(error, stdout, status) {
		if(error) {
			results[directory] = { status: error.code, stdout: error.message };
		}
		else {
			results[directory] = { status: status, stdout: stdout };
		}
		
		done++;
		
		if(done >= total) {
			Loader.stop();
			display_results(results);
		}
		callback();
	});
}

var Loader = (function() {
	var pool = ["|", "/", "-", "\\" ];
	var cursor = 0;
	var running = false;
	var tick = function() {
		if(running) {
			cursor++;
			if(cursor >= pool.length) {
				cursor = 0;
			}
			process.stdout.cursorTo(0);
			process.stdout.write("Chargement en cours ... " + pool[cursor] + "  ");
			setTimeout(tick, 1000);
		}
	};
	this.start = function() {
		running = true;
		tick();
	};
	this.stop = function() {
		running = false;
		process.stdout.cursorTo(0);
	};
	return this;
})();

/* Add display handlers */

display_handlers["status"] = function(data) {

	var getModuleInformations = function(output) {
		var module_data = output.stdout.split("\n").filter(function(a) { return a.length > 0 && a[0] != " "; });
		//var module_data = data[k].split("\n");
		var upToDate =
			(typeof module_data[1] != "undefined" && module_data[1].indexOf("à jour") > -1) ||
			(typeof module_data[2] != "undefined" && module_data[2].indexOf("à jour") > -1)
		;
		var late = 0;
		if(!upToDate) {
			late = parseInt(module_data[1]);
		}
		return {
			branch: module_data[0].split(" ").pop(),
			upToDate: upToDate,
			late: late,
			clear:
				(typeof module_data[1] != "undefined" && module_data[1].indexOf("propre") > -1) ||
				(typeof module_data[2] != "undefined" && module_data[2].indexOf("propre") > -1)
		};
	};

	/* compute sizes */

	var totalSize = 13;
	var sizes = [ 0, 16, 6, 6 ];
	for(var k in data) {
		var infos = getModuleInformations(data[k]);
		if(k.length > sizes[0]) {
			sizes[0] = k.length;
		}
		if(infos.branch.length > sizes[1]) {
			sizes[1] = infos.branch.length;
		}
	}
	for(var k in sizes) {
		totalSize += sizes[k];
	}

	/* render */

	var formatString = "| %s | %s | %s | %s |";
	var color = function(text, size) {
		if(text == "Oui") {
			return "\x1b[32m" + text.padEnd(size) + "\x1b[0m";
		}
		else if(text == "Non") {
			return "\x1b[31m" + text.padEnd(size) + "\x1b[0m";
		}
		else {
			return text.padEnd(size);
		}
	};
	var render = function(module, branch, upToDate, clean) {
		console.log(util.format(
			formatString,
			module.padEnd(sizes[0]),
			branch.padEnd(sizes[1]),
			color(upToDate, sizes[2]),
			color(clean, sizes[3])
		));
	};

	console.log("-".repeat(totalSize));
	render("Module", "Branche", "À jour", "Propre");
	console.log("-".repeat(totalSize));
	
	/* Precomputed data here to agregate directories */
	var directories = {};
	for(var k in data) {
		var infos = getModuleInformations(data[k]);
		var moduleDirectory = k.split("/");
		var lastDir = directories;
		for(var i = 0, max = moduleDirectory.length; i < max; i++) {
			if(moduleDirectory[i] != "." && moduleDirectory[i] != "..") {
				if(typeof lastDir[moduleDirectory[i]] == "undefined") {
					if(i < max - 1) {
						lastDir[moduleDirectory[i]] = {};
					}
					else {
						lastDir[moduleDirectory[i]] = infos.branch == "master" && infos.upToDate && infos.clear;
					}
				}
				lastDir = lastDir[moduleDirectory[i]];
			}
		}
	}
	var aggregateDirectories = function(dirs) {
		if(typeof dirs == "boolean") {
			return dirs;
		}
		var isAggregable = true;
		for(var k in dirs) {
			var aggregatedDirectories = aggregateDirectories(dirs[k]);
			if(typeof aggregatedDirectories == "boolean") {
				dirs[k] = aggregatedDirectories;
			}
			if(typeof aggregatedDirectories != "boolean" || !dirs[k]) {
				isAggregable = false;
			}
		};
		return isAggregable ? true : dirs;
	};
	directories = aggregateDirectories(directories);
	
	var directoriesDisplayed = {};
	for(var k in data) {
		var infos = getModuleInformations(data[k]);
		var moduleDirectory = k.split("/");
		var fullDir = "";
		var lastDir = directories;
		var isAggregated = false;
		for(var i = 0, max = moduleDirectory.length; i < max; i++) {
			if(moduleDirectory[i] != "." && moduleDirectory[i] != "..") {
				if(typeof lastDir[moduleDirectory[i]] == "undefined") {
					isAggregated = true;
					break;
				}
				
				lastDir = lastDir[moduleDirectory[i]];
			}
			fullDir += (fullDir ? "/" : "") + moduleDirectory[i];
		}
		
		if(isAggregated) {
			if(typeof directoriesDisplayed[fullDir] == "undefined") {
				directoriesDisplayed[fullDir] = true;
				render(fullDir + "/*", "master", "Oui", "Oui");
			}
		}
		else {
			if(realCommand == "stat") {
				if(!infos.upToDate || infos.late || !infos.clear) {
					render(k, infos.branch, infos.upToDate ? "Oui" : "Non", infos.clear ? "Oui" : "Non");
				}
			}
			else {
					render(k, infos.branch, infos.upToDate ? "Oui" : "Non", infos.clear ? "Oui" : "Non");
			}
		}
	}
	
	console.log("-".repeat(totalSize));
};

display_handlers["pull"] = function(data) {
	
	for(var k in data) {
		console.log(" o----------------------------------------------------------------------------------------------------");
		console.log(" | ");
		console.log(" |\t\t\tgit " + command + " " + k);
		console.log(" | ");
		console.log(data[k].stdout);
	}
	
	/* compute sizes */

	var totalSize = 7;
	var sizes = [ 0, 11 ];
	for(var k in data) {
		if(k.length > sizes[0]) {
			sizes[0] = k.length;
		}
	}
	for(var k in sizes) {
		totalSize += sizes[k];
	}

	/* render */

	var formatString = "| %s | %s |";
	var color = function(text, size) {
		if(text == "À jour") {
			return "\x1b[32m" + text.padEnd(size) + "\x1b[0m";
		}
		else if(text == "Mis à jour") {
			return "\x1b[33m" + text.padEnd(size) + "\x1b[0m";
		}
		else if(text == "Erreur") {
			return "\x1b[31m" + text.padEnd(size) + "\x1b[0m";
		}
		else {
			return text.padEnd(size);
		}
	};
	var render = function(module, status) {
		console.log(util.format(
			formatString,
			module.padEnd(sizes[0]),
			color(status, sizes[1])
		));
	};

	console.log("-".repeat(totalSize));
	render("Module", "Status");
	console.log("-".repeat(totalSize));
	
	for(var k in data) {
		var text = "À jour";
		if(data[k].status) {
			/* Do not check first letter to not worry about upper case or lower case x) x) */
			if(data[k].stdout.indexOf("rror") > -1 || data[k].stdout.indexOf("rreur") > -1) {
				text = "Erreur";
			}
			else {
				text = "Mis à jour";
			}
		}
		render(k, text);
	}
	
	console.log("-".repeat(totalSize));
};


/* Find all .git directories to know all projects */

var FIND_COMMAND = 'find . -name ".git" -type d -maxdepth 5';

Loader.start();

exec(FIND_COMMAND, function(error, stdout, status) {
	if(error) {
//		console.error("Error in 'find' : " + error);
//		return false;
	}
	var directories = stdout.split("\n");
	
	total = directories.length;
	for(var k in directories) {
		var dir = directories[k];
		if(dir) {
			(function(d) { Requester.add(git_exec, [ d.toDir() ]); })(dir);
		}
		else {
			total--;
		}
	}
});
