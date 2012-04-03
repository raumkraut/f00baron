/*
	General game objects and stuff.
	
	Custom game events, with their params:
	NB: All events should supply the "game" param
	These events should be triggered on the `window` object.
		startGame: The games have begun!
			game: <The relevant game object>
		tick: Some time has passed in the game
			dt: <Normalised milliseconds since previous tick>
		newPlane: A new challenger appears!
			plane: <The relevant plane object>
		newBullet: You're fired!
			plane: <The firing plane object>
			bullet: <The relevant bullet object>
		impact: BOOM! HEADSHOT!
			parties: [Array of impacting parties]
	The following events will be triggered on the plane's DOM object
		engineOn: A plane has switched its engine on
			plane: <The plane in question>
		engineOff: A plane has switched off its engine
			plane: <The plane in question>
		rotateCW: A plane is rotating clockwise
			plane: <The plane in question>
		rotateACW: A plane is rotating anti-clockwise
			plane: <The plane in question>
		rotateOff: A plane has stopped rotating
			plane: <The plane in question>
		fire: A plane is firing
			plane: <The plane in question>
*/
// RequestAnimationFrame shim
window.requestAnimationFrame = (function() {
	return window.requestAnimationFrame
		|| window.webkitRequestAnimationFrame
		|| window.mozRequestAnimationFrame
		|| window.oRequestAnimationFrame
		|| window.msRequestAnimationFrame
		|| function( callback ){
			window.setTimeout(callback, 1000 / 60);
		};
})();


f00baron = new Object();

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
	
	var ground_level = 935;
	
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
			
			jQuery(window).trigger('tick', {dt: dt});
			
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
		var plane = new f00baron.Plane({element:params.element});
		// Set up the controls
		jQuery(window).on('keydown keyup', function(event) {
			// Map keycode to control params
			var event_type = params.controls[event.which];
			if (event_type == undefined) {
				return;
			}
			// Check for end of rotation
			if (event.type == 'keyup' && event_type.search('rotate') == 0) {
				event_type = 'rotateOff';
			}
			
			jQuery(plane.element).trigger(event_type, {plane: plane});
		});
		
	}

f00baron.Plane = function(params) {
	/*
		Vrooom! Neeeeeow! Dakka dakka dakka!
		
		params = {
			element: The jQuery element representing this plane.
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
	
	// Constants
	// Power/gravity is speed/sec from the engine
	var gravity = 400;
	var thrust = 200;
	// Drag is ratio/sec
	var drag = 0.4;
	var stall_speed = 100;
	// Gravity has no (net) effect above the unstall_speed
	var unstall_speed = 200;
	// Rotate in deg/sec
	var rotate_speed = 200;
	
	this.respawn = function() {
		// Variables
		this.pos = start_pos
		this.heading = start_heading;
		this.pitch = 0;
		this.engine = false;
		this.airborne = false;
		this.stalled = false;
		// Speed is used for powered flight, vx/vy for ballistic
		this.speed = 0;
		this.vx = 0;
		this.vy = 0;
	}
	this.respawn();
	
	// Register event listeners
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
	
	jQuery(window).on('tick', function(event, params) {
		/*
			Update the plane's position and whatnot.
			
			params = {
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
		
		// Apply gravity
		// Gravity has no effect when vx > unstall_speed
		if (self.vx < unstall_speed) {
			// ...and is graduated between stall_speed and unstall_speed
			var grabbity = 1;
			if (self.vx > stall_speed) {
				grabbity -= (self.vx - stall_speed) / (unstall_speed - stall_speed);
			}
			self.vy += gravity * grabbity * dt;
		}
		
		if (!self.airborne) {
			// Have we taken off yet?
			if (self.vx < stall_speed) {
				self.vy = 0;
			} else if (self.vy < 0) {
				self.airborne = true;
			} else {
				self.vy = 0;
			}
		}
		// Apply rotation
		if (self.airborne) {
			dr = self.pitch * (rotate_speed * dt);
		} else {
			dr = 0;
		}
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
		// Normalise rotation
		if (self.heading < 0) {
			self.heading += 360;
		} else if (self.heading > 360) {
			self.heading -= 360;
		}
		
		/// TODO: Replace this with a "moved" event, or something
		self.draw();
	});
}
	f00baron.Plane.prototype.draw = function() {
		/*
			Updates the plane's graphical element.
		*/
		this.element.attr('x', this.pos[0]);
		this.element.attr('y', this.pos[1]);
		var transform = 'rotate(' + this.heading + ')';
		this.element.find('.rotator').attr('transform', transform);
	}
	
