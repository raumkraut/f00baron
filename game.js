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
// RequestAnimationFrame shim
window.requestAnimationFrame = (function() {
	return window.requestAnimationFrame
		|| window.webkitRequestAnimationFrame
		|| window.mozRequestAnimationFrame
		|| window.oRequestAnimationFrame
		|| window.msRequestAnimationFrame
		|| function( callback ){
			window.setTimeout(function(){callback(Date.now())}, 1000 / 60);
		};
})();


f00baron = new Object();

f00baron.getAbsolutePos = function(element) {
	/*
		Returns the root-space coordinates for given jQuery SVG element.
		
		Return value is an array of the form: [x,y]
	*/
	element = element[0];
	if (element == undefined) {
		throw new Error('Called getAbsolutePos on empty element set');
	}
	if (element.getScreenBBox != undefined) {
		// Support for getScreenBBox is limited. :(
		var bbox = element.getScreenBBox();
		return [bbox.x + bbox.width/2, bbox.y + bbox.height/2];
	}
	// Create a root-space SVG point to work with
	var svg = document.querySelector('svg');
	var point = svg.createSVGPoint();
	if (element.nodeName != 'svg') {
		// An SVG element's x and y are used in the matrix,
		// so we don't want to use them here as well.
		point.x = element.x.animVal.value;
		point.y = element.y.animVal.value;
	}
	var matrix = element.getTransformToElement(svg);
	point = point.matrixTransform(matrix);
	return [point.x, point.y];
}


f00baron.Game = function(params) {
	/*
		Class which processes the game logic.
		
		This is the only class which should generally need to be directly
		be instantiated and interacted with by document javascript.
		
		params = {
			ground: <jQuery-wrapped ground element>
			clouds: <jQuery-wrapped list of clouds elements>
			explosion: <jQuery-wrapped explosion template element>
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	
	var ground = params.ground[0].getBBox().y;
	
	// Array of informational objects. Array index is player_id
	var players = [];
	
	// Create the clouds
	params.clouds.each(function(idx) {
		var element = jQuery(this);
		var bbox = this.getBBox();
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
		jQuery(window).trigger('newCloud', {cloud: cloud});
		
	});
	
	var explosion = params.explosion.clone().detach();
	explosion.removeClass('template');
	jQuery(window).on('explosion', function(event, params) {
		var element = explosion.clone();
		if (params.target) {
			element.addClass('player' + (params.target.player+1));
			if (params.target.player % 2) {
				element.find('.debris').attr('transform', 'scale(-1,1)');
			}
		}
		element.appendTo(jQuery('#explosions'));
		var explodey = new f00baron.Explosion({
			 element: element
			,x: params.x
			,y: params.y
		});
	});
	
	jQuery(window).on('newPlane', function(event, params) {
		players[params.plane.player].plane = params.plane;
	});
	
	// Check for interactions
	jQuery(window).on('newPosition', function(event, params) {
		// Check if the target has collided with a plane.
		if (!params.target.collidable) {
			return;
		}
		for (idx in players) {
			var other = players[idx].plane;
			if (other === params.target) {
				// Stop hitting yourself
				continue;
			} else if (!other.collidable) {
				// You can't hit what can't be hit
				continue;
			}
			
			// Determine angle from target to other
			var dx = other.x - params.target.x;
			var dy = other.y - params.target.y;
			var angle = Math.atan2(dy, dx);
			// Get minimum safe distance between objects
			var cutoff = params.target.elliptical_radius(angle) + other.elliptical_radius(angle);
			if ((dx*dx + dy*dy) < (cutoff * cutoff)) {
				// Impact!
				jQuery(params.target.element).trigger('destroy', {
					 target: params.target
					,by: other
				});
				jQuery(other.element).trigger('destroy', {
					 target: other
					,by: params.target
				});
			}
			
		}
		
	});
	
	this.add_player = function(params) {
		/*
			Add a player to the game.
			
			params = {
				element: <The jQuery-wrapped DOM element.>
				controls: {a mapping of keycode: eventType for this player}
				scoreboard: <jQuery-wrapped scoreboard element>
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
		jQuery(window).trigger('newPlane', {plane: plane});
		
		// Set up the controls
		jQuery(window).on('keydown keyup', function(event) {
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
			
			jQuery(plane.element).trigger(event_type, {target: plane});
		});
		
		jQuery(plane.element).on('destroy', function(event, params) {
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
			
			info.scoreboard.text(info.score);
		});
	}
	
}
	f00baron.Game.prototype.start = function() {
		/*
			Start the game running.
			
			params = {
			}
		*/
		var prev_tick = Date.now();
		var do_tick = function(now) {
			var dt = now - prev_tick;
			prev_tick = now;
			
			// Lock the dt between bounds
			if (dt < 0) {
				dt = 0;
			} else if (dt > 50) {
				dt = 50;
			}
			
			jQuery(window).trigger('tick', {
				 now: now
				,dt: dt
			});
			
			window.requestAnimationFrame(do_tick);
		}
		// The first tick
		jQuery(window).trigger('startGame', {game:this});
		do_tick(prev_tick);
	}


f00baron.Plane = function(params) {
	/*
		Vrooom! Neeeeeow! Dakka dakka dakka!
		
		params = {
			element: The jQuery element representing this plane.
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
	this.element.data('f00baron.object', this);
	this.player = params.player;
	
	var start_pos = [parseInt(this.element.attr('x')), parseInt(this.element.attr('y'))];
	var start_heading = this.element.find('.rotator').attr('transform');
	start_heading = parseInt(start_heading.replace(/.*rotate\((-?[0-9]+)\).*/, '$1'), 10);
	var dimensions = this.element.find('.sizer')[0].getBBox()
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
		var bbox = self.element[0].getBBox();
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
		self.last_fire = Date.now();
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
	jQuery(this.element).on('destroy', function(event) {
		jQuery(window).trigger('explosion', {
			 target: self
			,x: self.x
			,y: self.y
		});
		respawn();
	});
	jQuery(this.element).on('engineOn', function(event) {
		self.engine = true;
	});
	jQuery(this.element).on('engineOff', function(event) {
		self.engine = false;
	});
	jQuery(this.element).on('rotateCW', function(event) {
		self.pitch = 1;
	});
	jQuery(this.element).on('rotateACW', function(event) {
		self.pitch = -1;
	});
	jQuery(this.element).on('rotateOff', function(event) {
		self.pitch = 0;
	});
	jQuery(this.element).on('fireOn', function(event) {
		self.firing = true;
	});
	jQuery(this.element).on('fireOff', function(event) {
		self.firing = false;
	});
	
	jQuery(this.element).on('fire', function(event) {
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
		var element = self.element.find('.bullet.template');
		var b_pos = f00baron.getAbsolutePos(element);
		element = element.clone().appendTo(jQuery('#board'));
		element.removeClass('template');
		element.attr('x', b_pos[0]);
		element.attr('y', b_pos[1]);
		
		var bullet = new f00baron.Bullet({
			 element: element
			,player: self.player
			,vx: b_vx
			,vy: b_vy
		});
		
		jQuery(window).trigger('newBullet', {source: self, bullet: bullet});
	});
	
	jQuery(this.element).on('newPosition', function(event) {
		/*
			Updates the plane's graphical element.
		*/
		self.element.attr('x', self.x);
		self.element.attr('y', self.y);
		var transform = 'rotate(' + self.heading + ')';
		self.element.find('.rotator').attr('transform', transform);
		self.bbox = get_bbox();
		
		// Check for out-of-bounds
		/// Should this be in here?
		if (self.y < ceiling + self.bbox.half_height) {
			self.stalled = true;
		} else if (self.airborne && self.y > ground - self.elliptical_radius(Math.PI/2)) {
			jQuery(self.element).trigger('destroy', {target: self});
		}
		
	});
	
	jQuery(window).on('tick', function(event, params) {
		/*
			Update the plane's position and whatnot.
			
			params = {
				now: The "current" timestamp.
				dt: The amount of time which has passed (milliseconds)
			}
		*/
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
		jQuery(self.element).trigger('newPosition', {target: self});
		
		// Fire at will!
		if (self.firing && self.airborne) {
			if (self.last_fire + fire_interval < params.now) {
				self.last_fire = params.now;
				jQuery(self.element).trigger('fire', {target: self});
			}
		}
	});
	
}

f00baron.Bullet = function(params) {
	/*
		Pew! Pew!
		
		params = {
			element: <jQuery-wrapped DOM element>
			vx: <Initial x-velocity>
			vy: <Initial y-velocity>
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	
	this.element = params.element;
	this.element.data('f00baron.object', this);
	this.player = params.player;
	this.collidable = true;
	
	this.size = this.element[0].getBBox().width;
	this.x = parseInt(this.element.attr('x'));
	this.y = parseInt(this.element.attr('y'));
	this.vx = params.vx;
	this.vy = params.vy;
	
	this.elliptical_radius = function(angle) {
		/*
			The elliptical radius of this bullet, at the given angle
			IN RADIANS.
		*/
		return self.size;
	}
	
	var tick = function(event, params) {
		/*
			Bullets move every tick; that's about it.
		*/
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
			jQuery(self.element).trigger('destroy', {target: self});
		} else {
			jQuery(self.element).trigger('newPosition', {target: self});
		}
		
	}
	jQuery(window).on('tick', tick);
	
	jQuery(this.element).on('destroy', function(event) {
		jQuery(window).off('tick', tick);
		self.element.remove();
	});
	jQuery(this.element).on('newPosition', function(event) {
		/*
			Update the bullet's graphic
		*/
		self.element.attr('x', self.x);
		self.element.attr('y', self.y);
	});
	
}


f00baron.Cloud = function(params) {
	/*
		A cloud, floating gently across the sky, and blocking sight.
		
		params = {
			element: <jQuery-wrapped DOM element>
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
	
	jQuery(window).on('tick', function(event, params) {
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
		jQuery(self.element).trigger('newPosition', {target:self});
	});
	jQuery(this.element).on('newPosition', function(event) {
		self.element.attr('x', self.x);
		self.element.attr('y', self.y);
	});
}

f00baron.Explosion = function(params) {
	/*
		BOOM!
		
		params = {
			element: <jQuery-wrapped DOM element representing the boom>
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
	
	self.element.attr('x', self.x);
	self.element.attr('y', self.y);
	
	// Give a unique ID to the element which begins all the animations
	var starter = self.element.find('.anim-start');
	var starter_id = 'f00baron_anim_' + Date.now();
	starter.attr('id', starter_id);
	// Update any element which relies on the starter for timing
	self.element.find('[begin^=f00baron]').each(function() {
		var anim = jQuery(this);
		var begin = anim.attr('begin');
		begin = begin.replace('f00baron_start', starter_id);
		anim.attr('begin', begin);
	});
	
	// Randomise the direction of rotations
	self.element.find('.rotator').each(function() {
		if (Math.random() > 0.5) {
			var rotator = jQuery(this);
			var from = rotator.attr('from');
			rotator.attr('from', rotator.attr('to'));
			rotator.attr('to', from);
		}
	});
	starter[0].beginElement();
	
	self.element.find('.anim-end').on('endEvent', function(event) {
		self.element.remove();
	});
	// Backup removals
	window.setTimeout(function() {self.element.remove()}, 5000);
	window.setTimeout(function() {
		self.element.find('.explosion').hide();
	}, 800);
	
}
