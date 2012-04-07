/*
	General game objects and stuff.
	
	Custom game events, with their params:
	NB: All events should supply the "game" param
	These events should be triggered on the `window` object.
		startGame: The games have begun!
			game: <The relevant game object>
		tick: Some time has passed in the game
			now: <"Current" timestamp>
			dt: <Normalised milliseconds since previous tick>
		newPlane: A new challenger appears!
			plane: <The relevant plane object>
		newBullet: You're fired!
			source: <The firing plane object>
			bullet: <The relevant bullet object>
		explosion: BOOM! HEADSHOT!
			pos: [Coordinates of explosion]
	The following events will be triggered on an object's DOM element
		newPosition: An object has a new position
			target: <The object in question>
		destroy: An object has been destroyed
			target: <The object in question>
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
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	// Register event listeners
	/// TODO
	
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
	f00baron.Game.prototype.add_player = function(params) {
		/*
			Add a player to the game.
			
			params = {
				element: <The jQuery-wrapped DOM element.>
				controls: {a mapping of keycode: eventType for this player}
			}
		*/
		var plane = new f00baron.Plane({
			 element: params.element
			,ground: 950
			,ceiling: 0
			,x_min: 0
			,x_max: 1000
		});
		// Set up the controls
		jQuery(window).on('keydown keyup', function(event) {
			// Map keycode to control params
			var event_type = params.controls[event.which];
			if (event_type == undefined) {
				return;
			}
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
		
	}

f00baron.Plane = function(params) {
	/*
		Vrooom! Neeeeeow! Dakka dakka dakka!
		
		params = {
			element: The jQuery element representing this plane.
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
	var thrust = 200;
	// Drag is ratio/sec
	var drag = 0.6;
	var stall_speed = 100;
	// Gravity has no (net) effect above the unstall_speed
	var unstall_speed = 300;
	// Rotate in deg/sec
	var rotate_speed = 200;
	// How much power (extra speed) our guns give to bullets fired
	var dakka = 400;
	// Delay between bullet firings (ms)
	var fire_interval = 1000;
	
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
		self.pos = [start_pos[0], ground - start_bbox.half_height];
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
	}
	respawn();
	
	// Register event listeners
	jQuery(this.element).on('destroy', function(event) {
		jQuery(window).trigger('explosion', {pos: self.pos});
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
			,velocity: [b_vx, b_vy]
		});
		
		jQuery(window).trigger('newBullet', {source: self, bullet: bullet});
	});
	
	jQuery(this.element).on('newPosition', function(event) {
		/*
			Updates the plane's graphical element.
		*/
		self.element.attr('x', self.pos[0]);
		self.element.attr('y', self.pos[1]);
		var transform = 'rotate(' + self.heading + ')';
		self.element.find('.rotator').attr('transform', transform);
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
		// Gravity has no effect when |vx| > unstall_speed
		if (h_speed < unstall_speed) {
			// ...and is graduated between stall_speed and unstall_speed
			var grabbity = 1;
			if (h_speed > stall_speed) {
				grabbity -= (h_speed - stall_speed) / (unstall_speed - stall_speed);
			}
			self.vy += gravity * grabbity * dt;
		}
		
		if (!self.airborne) {
			// Have we taken off yet?
			if (h_speed < stall_speed) {
				self.vy = 0;
			} else if (self.vy < 0) {
				self.airborne = true;
			} else {
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
		self.pos = [self.pos[0] + dx, self.pos[1] + dy];
		self.heading += dr;
		
		// Normalise position
		if (self.pos[0] < x_min) {
			self.pos[0] = x_max;
		} else if (self.pos[0] > x_max) {
			self.pos[0] = x_min;
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
		self.bbox = get_bbox();
		
		// Check for out-of-bounds
		/// Probably shouldn't be in here, ideally.
		if (self.pos[1] < ceiling + self.bbox.half_height) {
			self.stalled = true;
		} else if (self.pos[1] > ground - self.bbox.half_height) {
			jQuery(self.element).trigger('destroy', {target: self});
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
			element: [Array of: x, y]
			velocity: [Array of: vx, vy]
		}
	*/
	if ( !(this instanceof arguments.callee) ) 
		throw new Error("I pity the fool who calls a constructor as a function!");
	
	var self = this;
	
	this.element = params.element;
	this.element.data('f00baron.object', this);
	
	this.pos = [parseInt(this.element.attr('x')), parseInt(this.element.attr('y'))];
	this.velocity = params.velocity;
	
	
	var tick = function(event, params) {
		/*
			Bullets move every tick; that's about it.
		*/
		var dt = params.dt / 1000;
		var dx = self.velocity[0] * dt;
		var dy = self.velocity[1] * dt;
		self.pos = [self.pos[0] + dx, self.pos[1] + dy];
		
		// Check for out-of-bounds
		/// TODO: Move this check somewhere without hard-coded limits
		var destroyed = false;
		if (self.pos[0] < 0 || self.pos[0] > 1000) {
			destroyed = true;
		} else if (self.pos[1] < 0 || self.pos[1] > 1000) {
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
		self.element.attr('x', self.pos[0]);
		self.element.attr('y', self.pos[1]);
	});
	
}
