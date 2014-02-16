/*
	General game objects and stuff.
	
	
	Distributed under the terms of the ISC license:
	
	Copyright (c) 2012 - Mel Collins <mel@raumkraut.net>
	
	Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
	
	THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
	
	
	Custom game events, with their params:
	NB: All events should supply the "game" param
	These events should be triggered on the `window` object.
		startGame: The games have begun!
			game: <The relevant game object>
		tick: Some time has passed in the game
			now: <"Current" timestamp>
			dt: <Normalised milliseconds since previous tick>
		newCloud: A new cloud has been created
			cloud: <The new cloud object>
		newPlane: A new challenger appears!
			plane: <The relevant plane object>
		newBullet: You're fired!
			source: <The firing plane object>
			bullet: <The relevant bullet object>
		explosion: BOOM! HEADSHOT!
			target: <The exploding object>
			x: <x-coord of explosion>
			y: <y-coord of explosion>
	The following events will be triggered on an object's DOM element
		newPosition: An object has a new position
			target: <The object in question>
		destroy: An object has been destroyed
			target: <The object in question>
			by: <What destroyed the object (optional)>
	The following events will be triggered on a plane's DOM element
		engineOn: A plane has switched its engine on
			target: <The plane in question>
		engineOff: A plane has switched off its engine
			target: <The plane in question>
		rotateCW: A plane is rotating clockwise
			target: <The plane in question>
		rotateACW: A plane is rotating anti-clockwise
			target: <The plane in question>
		rotateOff: A plane has stopped rotating
			target: <The plane in question>
		fireOn: A plane is firing
			target: <The plane in question>
		fireOff: A plane has stopped firing
			target: <The plane in question>
		fire: A plane is firing a bullet
			target: <The plane in question>
*/

f00baron = new Object();

f00baron.forEach = function(arr, callback) {
	/*
		Acts like <Array>.forEach, but also works for things which aren't
		necessarily Array objects.
	*/
	return Array.prototype.forEach.call(arr, callback);
}

f00baron.trigger = function(type, detail, target) {
	/*
		Fires an event of the given `type` and having additional `detail`.
		
		If a `target` DOM element is not given, the event will be fired from
		the window element.
		
		Returns the created event instance, in case you were curious.
	*/
	if (target === undefined) {
		target = window;
	}
	var event = new CustomEvent(type, {bubbles: true, detail: detail});
	target.dispatchEvent(event);
	return event;
}

f00baron.getAbsolutePos = function(element) {
	/*
		Returns the root-space coordinates for given SVG DOM element.
		
		Return value is an array of the form: [x,y]
	*/
	if (element.getScreenBBox != undefined) {
		// Support for getScreenBBox is limited. :(
		var bbox = element.getScreenBBox();
		return [bbox.x + bbox.width/2, bbox.y + bbox.height/2];
	}
	
	if (element.nodeName == 'svg') {
		// Because of browser bugs/inconsistencies, we can't getTransformToElement
		// from one svg element to another, since *sometimes* one of the svg's
		// viewports gets ignored... -_-
		// Find the first sub-element which has coordinates
		// (we only use this function in one place, so we short-cut >_> )
		element = element.getElementsByTagName('use')[0]
	}
	
	// Create a root-space SVG point to work with
	var svg = document.querySelector('svg');
	var point = svg.createSVGPoint();
	point.x = element.x.animVal.value;
	point.y = element.y.animVal.value;
	
	// Hack because of webkit bug:
	// https://bugs.webkit.org/show_bug.cgi?id=86010
	var matrix = svg.getScreenCTM().inverse().multiply(element.getScreenCTM());
	//var matrix = element.getTransformToElement(svg);
	point = point.matrixTransform(matrix);
	return [point.x, point.y];
}


f00baron.Game = function(params) {
	/*
		Class which processes the game logic.
		
		This is the only class which should generally need to be directly
		be instantiated and interacted with by document javascript.
		
		params = {
			ground: <ground DOM element>
			clouds: <collection of cloud DOM elements>
			explosion: <explosion template DOM element>
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	
	var ground = params.ground.getBBox().y;
	
	// Array of informational objects. Array index is player_id
	var players = [];
	
	// Create the clouds
	f00baron.forEach(params.clouds, function(element) {
		var bbox = element.getBBox();
		var half_height = bbox.height / 2;
		var half_width = bbox.width / 2;
		var cloud = new f00baron.Cloud({
			 element: element
			,x_min: 0 - half_width
			,x_max: 1000 + half_width
			,y_min: 200
			,y_max: 600
			// Transition time range (sec)
			,t_min: 10
			,t_max: 60
		});
		window.dispatchEvent
		f00baron.trigger('newCloud', {cloud: cloud});
		
	});
	
	var explosions = document.getElementById('explosions');
	var explosion = params.explosion.parentNode.removeChild(params.explosion);
	explosion.classList.remove('template');
	window.addEventListener('explosion', function(event) {
		var params = event.detail;
		var element = explosion.cloneNode(true);
		if (params.target) {
			element.classList.add('player' + (params.target.player+1));
			if (params.target.player % 2) {
				f00baron.forEach(element.getElementsByClassName('debris'), function(debris) {
					debris.setAttribute('transform', 'scale(-1,1)');
				});
			}
		}
		explosions.appendChild(element);
		var explodey = new f00baron.Explosion({
			 element: element
			,x: params.x
			,y: params.y
		});
	});
	
	window.addEventListener('newPlane', function(event) {
		var params = event.detail;
		players[params.plane.player].plane = params.plane;
	});
	
	// Check for interactions
	window.addEventListener('newPosition', function(event) {
		var params = event.detail;
		// Check if the target has collided with a plane.
		if (!params.target.collidable) {
			return;
		}
		players.forEach(function(player, idx) {
			var other = player.plane;
			if (other === params.target) {
				// Stop hitting yourself
				return;
			} else if (!other.collidable) {
				// You can't hit what can't be hit
				return;
			}
			
			// Determine angle from target to other
			var dx = other.x - params.target.x;
			var dy = other.y - params.target.y;
			var angle = Math.atan2(dy, dx);
			// Get minimum safe distance between objects
			var cutoff = params.target.elliptical_radius(angle) + other.elliptical_radius(angle);
			if ((dx*dx + dy*dy) < (cutoff * cutoff)) {
				// Impact!
				f00baron.trigger('destroy', {
					 target: params.target
					,by: other
				}, params.target.element);
				f00baron.trigger('destroy', {
					 target: other
					,by: params.target
				}, other.element);
			}
			
		});
		
	});
	
	this.add_player = function(params) {
		/*
			Add a player to the game.
			
			params = {
				element: <plane DOM element>
				controls: {a mapping of keycode: eventType for this player}
				scoreboard: <scoreboard DOM element>
			}
		*/
		var player_id = players.length;
		var info = {
			 score: 0
			,scoreboard: params.scoreboard
		}
		players[player_id] = info;
		
		var plane = new f00baron.Plane({
			 element: params.element
			,player: player_id
			,ground: ground
			,ceiling: 0
			,x_min: 0
			,x_max: 1000
		});
		f00baron.trigger('newPlane', {plane: plane});
		
		// Set up the controls
		var handle_key = function(event) {
			// Map keycode to control params
			var event_type = params.controls[event.which];
			if (event_type == undefined) {
				return;
			}
			
			// This key is a known control, so don't process it "normally"
			event.preventDefault();
			event.stopImmediatePropagation();
			
			// Some effects change depending on keyup/keydown
			if (event.type == 'keydown') {
				switch (event_type) {
					case 'fire':
						event_type = 'fireOn';
						break;
				}
			} else if (event.type == 'keyup') {
				switch (event_type) {
					case 'rotateCW':
					case 'rotateACW':
						event_type = 'rotateOff';
						break;
					case 'fire':
						event_type = 'fireOff';
						break;
				}
			}
			
			f00baron.trigger(event_type, {target: plane}, plane.element);
		};
		window.addEventListener('keydown', handle_key);
		window.addEventListener('keyup', handle_key);
		
		plane.element.addEventListener('destroy', function(event) {
			var params = event.detail;
			// A plane has been destroyed!
			var info = players[player_id];
			if (!params.by) {
				info.score -= 1;
			} else if (params.by.player == player_id) {
				info.score -= 1;
			} else {
				info = players[params.by.player];
				info.score += 1;
			}
			info.scoreboard.textContent = info.score;
		});
	}
	
}
	f00baron.Game.prototype.start = function() {
		/*
			Start the game running.
		*/
		var prev_tick = 0;
		var do_tick = function(now) {
			var dt = now - prev_tick;
			prev_tick = now;
			
			// Lock the dt between bounds
			if (dt < 0) {
				dt = 0;
			} else if (dt > 50) {
				dt = 50;
			}
			
			f00baron.trigger('tick', {
				 now: now
				,dt: dt
			});
			
			window.requestAnimationFrame(do_tick);
		}
		// The first tick
		f00baron.trigger('startGame', {game:this});
		do_tick(prev_tick);
	}


f00baron.Plane = function(params) {
	/*
		Vrooom! Neeeeeow! Dakka dakka dakka!
		
		params = {
			element: The DOM element representing this plane.
			player: The player to whom this plane belongs
			ground: The scene's ground level.
			ceiling: The scene's flight ceiling.
			x_min: The minimum X coordinate.
			x_max: The maximum X coordinate.
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	
	this.element = params.element;
	this.player = params.player;
	this.bullet = this.element.getElementsByClassName('bullet template')[0];
	
	var start_pos = [
		 parseInt(this.element.getAttribute('x'))
		,parseInt(this.element.getAttribute('y'))
	];
	var start_heading = this.element.getElementsByClassName('rotator')[0].getAttribute('transform');
	start_heading = parseInt(start_heading.replace(/.*rotate\((-?[0-9]+)\).*/, '$1'), 10);
	var dimensions = this.element.getElementsByClassName('sizer')[0].getBBox()
	var height = dimensions.height;
	var width = dimensions.width;
	
	// Airspace boundaries
	var ground = params.ground;
	var ceiling = params.ceiling;
	var x_min = params.x_min - width/2;
	var x_max = params.x_max + width/2;
	
	
	// Plane attributes
	// Power/gravity is speed/sec from the engine
	var gravity = 350;
	var thrust = 300;
	// Drag is ratio/sec
	var drag = 0.8;
	var stall_speed = 150;
	var unstall_speed = 300;
	// Gravity has no effect over lift_speed
	var lift_speed = 500;
	// Rotate in deg/sec
	var rotate_speed = 200;
	// How much power (extra speed) our guns give to bullets fired
	var dakka = 400;
	// Delay between bullet firings (ms)
	var fire_interval = 400;
	
	var get_bbox = function() {
		var bbox = self.element.getBBox();
		return {
			 height: bbox.height
			,width: bbox.width
			,half_height: bbox.height / 2
			,half_width: bbox.width / 2
		}
	}
	var start_bbox = get_bbox();
	
	var respawn = function() {
		// Flight parameters
		self.heading = start_heading;
		self.bbox = get_bbox();
		self.x = start_pos[0];
		self.y = ground - start_bbox.half_height;
		self.pitch = 0;
		self.engine = false;
		self.airborne = false;
		self.stalled = false;
		// Speed is used for powered flight, vx/vy for ballistic
		self.speed = 0;
		self.vx = 0;
		self.vy = 0;
		// Gunnery
		self.firing = false;
		self.last_fire = 0;
		// Interaction
		self.collidable = false;
	}
	respawn();
	
	this.elliptical_radius = function(angle) {
		/*
			Returns the radius of an approximate ellipse around the plane,
			at the given angle IN RADIANS.
			
			r = (a*b) / sqrt((b*cosØ)² + (a*sinØ)²)
		*/
		var a = width / 2;
		var b = height / 2;
		var theta = angle - (self.heading * Math.PI/180);
		
		var bcos = b * Math.cos(theta);
		var asin = a * Math.sin(theta);
		var den = Math.sqrt(Math.pow(bcos, 2) + Math.pow(asin, 2))
		var num = a * b
		
		return num/den;
	}
	
	// Register event listeners
	this.element.addEventListener('destroy', function(event) {
		f00baron.trigger('explosion', {
			 target: self
			,x: self.x
			,y: self.y
		});
		respawn();
	});
	this.element.addEventListener('engineOn', function(event) {
		self.engine = true;
	});
	this.element.addEventListener('engineOff', function(event) {
		self.engine = false;
	});
	this.element.addEventListener('rotateCW', function(event) {
		self.pitch = 1;
	});
	this.element.addEventListener('rotateACW', function(event) {
		self.pitch = -1;
	});
	this.element.addEventListener('rotateOff', function(event) {
		self.pitch = 0;
	});
	this.element.addEventListener('fireOn', function(event) {
		self.firing = true;
	});
	this.element.addEventListener('fireOff', function(event) {
		self.firing = false;
	});
	
	this.element.addEventListener('fire', function(event) {
		/*
			Create a bullet in front of the plane, with the same velocity
			vector.
		*/
		var b_vx, b_vy;
		var radians = self.heading * (Math.PI / 180);
		var sine = Math.sin(radians);
		var cosine = Math.cos(radians);
		b_vx = self.vx + (dakka * cosine);
		b_vy = self.vy + (dakka * sine);
		
		// Clone the bullet template, and move it to root-space
		var b_pos = f00baron.getAbsolutePos(self.bullet);
		var element = self.bullet.cloneNode(true);
		document.getElementById('board').appendChild(element);
		element.setAttribute('x', b_pos[0]);
		element.setAttribute('y', b_pos[1]);
		element.classList.remove('template');
		
		var bullet = new f00baron.Bullet({
			 element: element
			,player: self.player
			,vx: b_vx
			,vy: b_vy
		});
		
		f00baron.trigger('newBullet', {source: self, bullet: bullet});
	});
	
	this.element.addEventListener('newPosition', function(event) {
		/*
			Updates the plane's graphical element.
		*/
		self.element.setAttribute('x', self.x);
		self.element.setAttribute('y', self.y);
		var transform = 'rotate(' + self.heading + ')';
		self.element.getElementsByClassName('rotator')[0].setAttribute('transform', transform);
		self.bbox = get_bbox();
		
		// Check for out-of-bounds
		/// Should this be in here?
		if (self.y < ceiling + self.bbox.half_height) {
			self.stalled = true;
		} else if (self.airborne && self.y > ground - self.elliptical_radius(Math.PI/2)) {
			f00baron.trigger('destroy', {target: self}, self.element);
		}
		
	});
	
	window.addEventListener('tick', function(event) {
		/*
			Update the plane's position and whatnot.
			
			params = {
				now: The "current" timestamp.
				dt: The amount of time which has passed (milliseconds)
			}
		*/
		var params = event.detail;
		var dx, dy, dr;
		var dt = params.dt / 1000;
		
		if (!self.stalled) {
			// Apply engine
			if (self.engine) {
				self.speed += (thrust * dt);
			}
			
			// Apply speed
			var radians = self.heading * (Math.PI / 180);
			self.vx = Math.cos(radians) * self.speed;
			self.vy = Math.sin(radians) * self.speed;
		}
		
		// Apply drag
		var drag_factor = 1 - (drag * dt);
		self.vx *= drag_factor;
		self.vy *= drag_factor;
		var h_speed = Math.abs(self.vx);
		
		// Apply gravity
		// Gravity has no effect when |vx| > lift_speed
		if (h_speed < lift_speed) {
			// ...and is graduated between stall_speed and lift_speed
			var grabbity = 1;
			if (h_speed > stall_speed) {
				grabbity -= (h_speed - stall_speed) / (lift_speed - stall_speed);
			}
			self.vy += gravity * grabbity * dt;
		}
		
		if (!self.airborne) {
			// Are we clear of the runway yet?
			self.y = ground - self.elliptical_radius(Math.PI/2);
			if (h_speed < stall_speed) {
				self.vy = 0;
			} else if (self.vy < 0) {
				self.airborne = true;
				self.collidable = true;
			} else if (self.vy > 0) {
				self.vy = 0;
			}
		}
		// Apply rotation
		dr = self.pitch * (rotate_speed * dt);
		
		// Update speed based on velocity
		self.speed = Math.sqrt(Math.pow(self.vx, 2) + Math.pow(self.vy, 2));
		
		// Entering/leaving a stall
		if (!self.stalled) {
			if (self.airborne && self.speed < stall_speed) {
				self.stalled = true;
			}
		} else if (self.speed > unstall_speed) {
			// Got to be pointing downwards
			if (self.heading > 75 && self.heading < 105) {
				self.stalled = false;
			}
		}
		
		// Update position/rotation
		dx = self.vx * dt;
		dy = self.vy * dt;
		self.x += dx;
		self.y += dy;
		self.heading += dr;
		
		// Normalise position
		if (self.x < x_min) {
			self.x = x_max;
		} else if (self.x > x_max) {
			self.x = x_min;
		}
		// Normalise rotation
		if (self.heading < 0) {
			self.heading += 360;
		} else if (self.heading > 360) {
			self.heading -= 360;
		}
		if (!self.airborne) {
			// Limit heading while on the ground
			if (self.heading > 0 && self.heading < 180) {
				if (dr > 0) {
					self.heading = 0;
				} else {
					self.heading = 180;
				}
			} else if (self.heading > 190 && self.heading < 350) {
				if (dr > 0) {
					self.heading = 190;
				} else {
					self.heading = 350;
				}
			}
		}
		f00baron.trigger('newPosition', {target: self}, self.element);
		
		// Fire at will!
		if (self.firing && self.airborne) {
			if (self.last_fire + fire_interval < params.now) {
				self.last_fire = params.now;
				f00baron.trigger('fire', {target: self}, self.element);
			}
		}
	});
	
}

f00baron.Bullet = function(params) {
	/*
		Pew! Pew!
		
		params = {
			element: <bullet DOM element>
			vx: <Initial x-velocity>
			vy: <Initial y-velocity>
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	
	this.element = params.element;
	this.player = params.player;
	this.collidable = true;
	
	this.size = this.element.getBBox().width;
	this.x = parseInt(this.element.getAttribute('x'));
	this.y = parseInt(this.element.getAttribute('y'));
	this.vx = params.vx;
	this.vy = params.vy;
	
	this.elliptical_radius = function(angle) {
		/*
			The elliptical radius of this bullet, at the given angle
			IN RADIANS.
		*/
		return self.size;
	}
	
	var tick = function(event) {
		/*
			Bullets move every tick; that's about it.
		*/
		var params = event.detail;
		var dt = params.dt / 1000;
		self.x += self.vx * dt;
		self.y += self.vy * dt;
		
		// Check for out-of-bounds
		/// TODO: Move this check somewhere without hard-coded limits
		var destroyed = false;
		if (self.x < 0 || self.x > 1000) {
			destroyed = true;
		} else if (self.y < 0 || self.y > 1000) {
			destroyed = true;
		}
		
		if (destroyed) {
			f00baron.trigger('destroy', {target: self}, self.element);
		} else {
			f00baron.trigger('newPosition', {target: self}, self.element);
		}
		
	}
	window.addEventListener('tick', tick);
	this.element.addEventListener('destroy', function(event) {
		window.removeEventListener('tick', tick);
		self.element.parentNode.removeChild(self.element);
	});
	
	this.element.addEventListener('newPosition', function(event) {
		/*
			Update the bullet's graphic
		*/
		self.element.setAttribute('x', self.x);
		self.element.setAttribute('y', self.y);
	});
	
}


f00baron.Cloud = function(params) {
	/*
		A cloud, floating gently across the sky, and blocking sight.
		
		params = {
			element: <cloud DOM element>
			x_min,x_max,y_min,y_max: <Define the random position limits>
			t_min,t_max: <Define the transition time range>
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	this.element = params.element;
	this.collidable = false;
	// The constants
	var x_min = params.x_min;
	var x_max = params.x_max;
	var x_range = x_max - x_min
	var y_min = params.y_min;
	var y_max = params.y_max;
	var y_range = y_max - y_min;
	var t_min = params.t_min;
	var t_max = params.t_max;
	var t_range = t_max - t_min;
	// Now the variables
	this.x = -1000;
	this.y = 0;
	this.vx = 0;
	
	window.addEventListener('tick', function(event) {
		var params = event.detail;
		var dt = params.dt / 1000;
		// Update position
		self.x += self.vx * dt;
		
		// Check for out-of-bounds
		if (self.x < x_min || self.x > x_max) {
			// Randomise velocity
			var dur = t_min + (Math.random() * t_range);
			self.vx = x_range / dur;
			// Randomise starting side
			if (Math.random() > 0.5) {
				self.x = x_max;
				self.vx *= -1;
			} else {
				self.x = x_min;
			}
			// Randomise starting height
			self.y = y_min + (Math.random() * y_range);
			
		}
		f00baron.trigger('newPosition', {target:self}, self.element);
	});
	this.element.addEventListener('newPosition', function(event) {
		self.element.setAttribute('x', self.x);
		self.element.setAttribute('y', self.y);
	});
}

f00baron.Explosion = function(params) {
	/*
		BOOM!
		
		params = {
			element: <DOM element representing the boom>
			x,y: <Coordinates of the explosion>
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	self.element = params.element;
	self.x = params.x;
	self.y = params.y;
	self.collidable = false;
	
	self.element.setAttribute('x', self.x);
	self.element.setAttribute('y', self.y);
	
	// Give a unique ID to the element which begins all the animations
	var starter = self.element.getElementsByClassName('anim-start')[0];
	var starter_id = 'f00baron_anim_' + Date.now();
	starter.setAttribute('id', starter_id);
	// Update any element which relies on the starter for timing
	f00baron.forEach(self.element.querySelectorAll('[begin^=f00baron]'), function(anim) {
		var begin = anim.getAttribute('begin');
		begin = begin.replace('f00baron_start', starter_id);
		anim.setAttribute('begin', begin);
	});
	
	// Randomise the direction of rotations
	f00baron.forEach(self.element.getElementsByClassName('rotator'), function(rotator) {
		if (Math.random() > 0.5) {
			var from = rotator.getAttribute('from');
			rotator.setAttribute('from', rotator.getAttribute('to'));
			rotator.setAttribute('to', from);
		}
	});
	starter.beginElement();
	
	var anim_end = self.element.getElementsByClassName('anim-end')[0];
	anim_end.addEventListener('endEvent', function(event) {
		self.element.parentNode.removeChild(self.element);
	});
	// Backup removals
	window.setTimeout(function() {
		if (self.element.parentNode) {
			self.element.parentNode.removeChild(self.element);
		}
	}, 5000);
	window.setTimeout(function() {
		self.element.getElementsByClassName('explosion')[0].style.display = 'none';
	}, 800);
	
}
