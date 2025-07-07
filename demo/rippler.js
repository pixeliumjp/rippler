// rippler.js - ESM module

class Rippler {
	static DEFAULTS = {
		imageUrl: null,
		resolution: 256,
		dropRadius: 20,
		perturbance: 0.03,
		interactive: true,
		crossOrigin: "",
	};

	constructor(element, options = {}) {
		this.element = element;
		this.options = { ...Rippler.DEFAULTS, ...options };

		// Initialize properties
		this.interactive = this.options.interactive;
		this.resolution = this.options.resolution;
		this.textureDelta = new Float32Array([
			1 / this.resolution,
			1 / this.resolution,
		]);
		this.perturbance = this.options.perturbance;
		this.dropRadius = this.options.dropRadius;
		this.crossOrigin = this.options.crossOrigin;
		this.imageUrl = this.options.imageUrl;

		// Initialize WebGL
		this.canvas = null;
		this.gl = null;
		this.config = null;

		// State
		this.visible = true;
		this.running = true;
		this.destroyed = false;

		// Buffers and textures
		this.textures = [];
		this.framebuffers = [];
		this.bufferWriteIndex = 0;
		this.bufferReadIndex = 1;

		// Programs
		this.dropProgram = null;
		this.updateProgram = null;
		this.renderProgram = null;

		// Background
		this.backgroundTexture = null;
		this.backgroundWidth = 0;
		this.backgroundHeight = 0;
		this.imageSource = null;

		// Initialize
		this._init();
	}

	_init() {
		// Check WebGL support
		this.config = this._loadConfig();
		if (!this.config) {
			throw new Error(
				"Your browser does not support WebGL or the required extensions",
			);
		}

		// Create canvas
		this._createCanvas();

		// Initialize WebGL context
		this._initGL();

		// Setup resize handler
		this._boundUpdateSize = this.updateSize.bind(this);
		window.addEventListener("resize", this._boundUpdateSize);

		// Setup pointer events
		this._setupPointerEvents();

		// Load image
		this.loadImage();

		// Start animation loop
		this._animate();
	}

	_loadConfig() {
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl") ||
			canvas.getContext("experimental-webgl");

		if (!gl) return null;

		// Load extensions
		const extensions = {};
		const extensionNames = [
			"OES_texture_float",
			"OES_texture_half_float",
			"OES_texture_float_linear",
			"OES_texture_half_float_linear",
		];

		for (const name of extensionNames) {
			const extension = gl.getExtension(name);
			if (extension) {
				extensions[name] = extension;
			}
		}

		if (!extensions.OES_texture_float) return null;

		const configs = [];

		const createConfig = (type, glType, arrayType) => {
			const name = "OES_texture_" + type;
			const nameLinear = name + "_linear";
			const linearSupport = nameLinear in extensions;
			const configExtensions = [name];

			if (linearSupport) {
				configExtensions.push(nameLinear);
			}

			return {
				type: glType,
				arrayType: arrayType,
				linearSupport: linearSupport,
				extensions: configExtensions,
			};
		};

		configs.push(createConfig("float", gl.FLOAT, Float32Array));

		if (extensions.OES_texture_half_float) {
			configs.push(
				createConfig(
					"half_float",
					extensions.OES_texture_half_float.HALF_FLOAT_OES,
					null,
				),
			);
		}

		// Test render to texture support
		const texture = gl.createTexture();
		const framebuffer = gl.createFramebuffer();

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		let config = null;

		for (const cfg of configs) {
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				32,
				32,
				0,
				gl.RGBA,
				cfg.type,
				null,
			);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				texture,
				0,
			);

			if (
				gl.checkFramebufferStatus(gl.FRAMEBUFFER) ===
					gl.FRAMEBUFFER_COMPLETE
			) {
				config = cfg;
				break;
			}
		}

		return config;
	}

	_createCanvas() {
		this.canvas = document.createElement("canvas");
		this.canvas.width = this.element.clientWidth;
		this.canvas.height = this.element.clientHeight;

		// Style canvas
		Object.assign(this.canvas.style, {
			position: "absolute",
			left: "0",
			top: "0",
			right: "0",
			bottom: "0",
			zIndex: "-1",
		});

		// Add class and append
		this.element.classList.add("rippler-container");
		this.element.style.position = "relative";
		this.element.appendChild(this.canvas);
	}

	_initGL() {
		const gl = this.gl = this.canvas.getContext("webgl") ||
			this.canvas.getContext("experimental-webgl");

		// Load extensions
		for (const name of this.config.extensions) {
			gl.getExtension(name);
		}

		// Create render targets
		const arrayType = this.config.arrayType;
		const textureData = arrayType ? new arrayType(this.resolution * this.resolution * 4) : null;

		for (let i = 0; i < 2; i++) {
			const texture = gl.createTexture();
			const framebuffer = gl.createFramebuffer();

			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MIN_FILTER,
				this.config.linearSupport ? gl.LINEAR : gl.NEAREST,
			);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MAG_FILTER,
				this.config.linearSupport ? gl.LINEAR : gl.NEAREST,
			);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_WRAP_S,
				gl.CLAMP_TO_EDGE,
			);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_WRAP_T,
				gl.CLAMP_TO_EDGE,
			);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				this.resolution,
				this.resolution,
				0,
				gl.RGBA,
				this.config.type,
				textureData,
			);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				texture,
				0,
			);

			this.textures.push(texture);
			this.framebuffers.push(framebuffer);
		}

		// Create quad
		this.quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, +1, -1, +1, +1, -1, +1]),
			gl.STATIC_DRAW,
		);

		// Initialize shaders
		this._initShaders();
		this._initTexture();
		this._setTransparentTexture();

		// Set GL state
		gl.clearColor(0, 0, 0, 0);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	}

	_initShaders() {
		const gl = this.gl;
		const vertexShader = `
		attribute vec2 vertex;
		varying vec2 coord;
		void main() {
		  coord = vertex * 0.5 + 0.5;
		  gl_Position = vec4(vertex, 0.0, 1.0);
		}
	  `;

		this.dropProgram = this._createProgram(
			vertexShader,
			`
		precision highp float;
		const float PI = 3.141592653589793;
		uniform sampler2D texture;
		uniform vec2 center;
		uniform float radius;
		uniform float strength;
		varying vec2 coord;
		void main() {
		  vec4 info = texture2D(texture, coord);
		  float drop = max(0.0, 1.0 - length(center * 0.5 + 0.5 - coord) / radius);
		  drop = 0.5 - cos(drop * PI) * 0.5;
		  info.r += drop * strength;
		  gl_FragColor = info;
		}
	  `,
		);

		this.updateProgram = this._createProgram(
			vertexShader,
			`
		precision highp float;
		uniform sampler2D texture;
		uniform vec2 delta;
		varying vec2 coord;
		void main() {
		  vec4 info = texture2D(texture, coord);
		  vec2 dx = vec2(delta.x, 0.0);
		  vec2 dy = vec2(0.0, delta.y);
		  float average = (
			texture2D(texture, coord - dx).r +
			texture2D(texture, coord - dy).r +
			texture2D(texture, coord + dx).r +
			texture2D(texture, coord + dy).r
		  ) * 0.25;
		  info.g += (average - info.r) * 2.0;
		  info.g *= 0.995;
		  info.r += info.g;
		  gl_FragColor = info;
		}
	  `,
		);

		gl.uniform2fv(this.updateProgram.locations.delta, this.textureDelta);

		this.renderProgram = this._createProgram(
			`
		precision highp float;
		attribute vec2 vertex;
		uniform vec2 topLeft;
		uniform vec2 bottomRight;
		uniform vec2 containerRatio;
		varying vec2 ripplesCoord;
		varying vec2 backgroundCoord;
		void main() {
		  backgroundCoord = mix(topLeft, bottomRight, vertex * 0.5 + 0.5);
		  backgroundCoord.y = 1.0 - backgroundCoord.y;
		  ripplesCoord = vec2(vertex.x, -vertex.y) * containerRatio * 0.5 + 0.5;
		  gl_Position = vec4(vertex.x, -vertex.y, 0.0, 1.0);
		}
	  `,
			`
		precision highp float;
		uniform sampler2D samplerBackground;
		uniform sampler2D samplerRipples;
		uniform vec2 delta;
		uniform float perturbance;
		varying vec2 ripplesCoord;
		varying vec2 backgroundCoord;
		void main() {
		  float height = texture2D(samplerRipples, ripplesCoord).r;
		  float heightX = texture2D(samplerRipples, vec2(ripplesCoord.x + delta.x, ripplesCoord.y)).r;
		  float heightY = texture2D(samplerRipples, vec2(ripplesCoord.x, ripplesCoord.y + delta.y)).r;
		  vec3 dx = vec3(delta.x, heightX - height, 0.0);
		  vec3 dy = vec3(0.0, heightY - height, delta.y);
		  vec2 offset = -normalize(cross(dy, dx)).xz;
		  float specular = pow(max(0.0, dot(offset, normalize(vec2(-0.6, 1.0)))), 4.0);
		  gl_FragColor = texture2D(samplerBackground, backgroundCoord + offset * perturbance) + specular;
		}
	  `,
		);

		gl.uniform2fv(this.renderProgram.locations.delta, this.textureDelta);
	}

	_createProgram(vertexSource, fragmentSource) {
		const gl = this.gl;

		const compileShader = (type, source) => {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);

			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(
					"Compile error: " + gl.getShaderInfoLog(shader),
				);
			}

			return shader;
		};

		const program = {
			id: gl.createProgram(),
			uniforms: {},
			locations: {},
		};

		gl.attachShader(
			program.id,
			compileShader(gl.VERTEX_SHADER, vertexSource),
		);
		gl.attachShader(
			program.id,
			compileShader(gl.FRAGMENT_SHADER, fragmentSource),
		);
		gl.linkProgram(program.id);

		if (!gl.getProgramParameter(program.id, gl.LINK_STATUS)) {
			throw new Error("Link error: " + gl.getProgramInfoLog(program.id));
		}

		// Get uniform locations
		gl.useProgram(program.id);
		gl.enableVertexAttribArray(0);

		const regex = /uniform (\w+) (\w+)/g;
		const shaderCode = vertexSource + fragmentSource;
		let match;

		while ((match = regex.exec(shaderCode)) !== null) {
			const name = match[2];
			program.locations[name] = gl.getUniformLocation(program.id, name);
		}

		return program;
	}

	_initTexture() {
		const gl = this.gl;
		this.backgroundTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	}

	_setTransparentTexture() {
		const gl = this.gl;
		const transparentPixels = this._createImageData(32, 32);
		gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			transparentPixels,
		);
	}

	_createImageData(width, height) {
		try {
			return new ImageData(width, height);
		} catch (e) {
			const canvas = document.createElement("canvas");
			return canvas.getContext("2d").createImageData(width, height);
		}
	}

	_setupPointerEvents() {
		const dropAtPointer = (event, big = false) => {
			if (this.visible && this.running && this.interactive) {
				const rect = this.element.getBoundingClientRect();
				const x = event.clientX - rect.left;
				const y = event.clientY - rect.top;

				this.drop(
					x,
					y,
					this.dropRadius * (big ? 1.5 : 1),
					big ? 0.14 : 0.01,
				);
			}
		};

		// Mouse events
		this.element.addEventListener("mousemove", (e) => dropAtPointer(e));
		this.element.addEventListener(
			"mousedown",
			(e) => dropAtPointer(e, true),
		);

		// Touch events
		this.element.addEventListener("touchstart", (e) => {
			for (const touch of e.changedTouches) {
				dropAtPointer(touch);
			}
		});

		this.element.addEventListener("touchmove", (e) => {
			for (const touch of e.changedTouches) {
				dropAtPointer(touch);
			}
		});
	}

	_animate() {
		if (!this.destroyed) {
			this.step();
			requestAnimationFrame(() => this._animate());
		}
	}

	// Public methods
	loadImage() {
		const gl = this.gl;
		const cssBackground = window.getComputedStyle(this.element).backgroundImage;
		const newImageSource = this.imageUrl || this._extractUrl(cssBackground);

		if (newImageSource === this.imageSource) return;

		this.imageSource = newImageSource;

		if (!this.imageSource) {
			this._setTransparentTexture();
			return;
		}

		const image = new Image();

		image.onload = () => {
			const isPowerOfTwo = (x) => (x & (x - 1)) === 0;
			const wrapping = (isPowerOfTwo(image.width) && isPowerOfTwo(image.height)) ? gl.REPEAT : gl.CLAMP_TO_EDGE;

			gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapping);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapping);
			gl.texImage2D(
				gl.TEXTURE_2D,
				0,
				gl.RGBA,
				gl.RGBA,
				gl.UNSIGNED_BYTE,
				image,
			);

			this.backgroundWidth = image.width;
			this.backgroundHeight = image.height;
			this._hideCssBackground();
		};

		image.onerror = () => {
			this._setTransparentTexture();
		};

		image.crossOrigin = this._isDataUri(this.imageSource) ? null : this.crossOrigin;
		image.src = this.imageSource;
	}

	step() {
		if (!this.visible) return;

		this._computeTextureBoundaries();

		if (this.running) {
			this.update();
		}

		this.render();
	}

	render() {
		const gl = this.gl;

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.canvas.width, this.canvas.height);
		gl.enable(gl.BLEND);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.useProgram(this.renderProgram.id);

		this._bindTexture(this.backgroundTexture, 0);
		this._bindTexture(this.textures[0], 1);

		gl.uniform1f(
			this.renderProgram.locations.perturbance,
			this.perturbance,
		);
		gl.uniform2fv(
			this.renderProgram.locations.topLeft,
			this.renderProgram.uniforms.topLeft,
		);
		gl.uniform2fv(
			this.renderProgram.locations.bottomRight,
			this.renderProgram.uniforms.bottomRight,
		);
		gl.uniform2fv(
			this.renderProgram.locations.containerRatio,
			this.renderProgram.uniforms.containerRatio,
		);
		gl.uniform1i(this.renderProgram.locations.samplerBackground, 0);
		gl.uniform1i(this.renderProgram.locations.samplerRipples, 1);

		this._drawQuad();
		gl.disable(gl.BLEND);
	}

	update() {
		const gl = this.gl;

		gl.viewport(0, 0, this.resolution, this.resolution);
		gl.bindFramebuffer(
			gl.FRAMEBUFFER,
			this.framebuffers[this.bufferWriteIndex],
		);
		this._bindTexture(this.textures[this.bufferReadIndex]);
		gl.useProgram(this.updateProgram.id);
		this._drawQuad();
		this._swapBufferIndices();
	}

	drop(x, y, radius, strength) {
		const gl = this.gl;
		const elWidth = this.element.clientWidth;
		const elHeight = this.element.clientHeight;
		const longestSide = Math.max(elWidth, elHeight);

		radius = radius / longestSide;

		const dropPosition = new Float32Array([
			(2 * x - elWidth) / longestSide,
			(elHeight - 2 * y) / longestSide,
		]);

		gl.viewport(0, 0, this.resolution, this.resolution);
		gl.bindFramebuffer(
			gl.FRAMEBUFFER,
			this.framebuffers[this.bufferWriteIndex],
		);
		this._bindTexture(this.textures[this.bufferReadIndex]);
		gl.useProgram(this.dropProgram.id);
		gl.uniform2fv(this.dropProgram.locations.center, dropPosition);
		gl.uniform1f(this.dropProgram.locations.radius, radius);
		gl.uniform1f(this.dropProgram.locations.strength, strength);

		this._drawQuad();
		this._swapBufferIndices();
	}

	updateSize() {
		const newWidth = this.element.clientWidth;
		const newHeight = this.element.clientHeight;

		if (
			newWidth !== this.canvas.width || newHeight !== this.canvas.height
		) {
			this.canvas.width = newWidth;
			this.canvas.height = newHeight;
		}
	}

	destroy() {
		this.destroyed = true;

		// Remove event listeners
		window.removeEventListener("resize", this._boundUpdateSize);

		// Remove canvas
		if (this.canvas && this.canvas.parentNode) {
			this.canvas.parentNode.removeChild(this.canvas);
		}

		// Restore CSS
		this._restoreCssBackground();
		this.element.classList.remove("rippler-container");

		// Clean up WebGL
		this.gl = null;
	}

	show() {
		this.visible = true;
		this.canvas.style.display = "block";
		this._hideCssBackground();
	}

	hide() {
		this.visible = false;
		this.canvas.style.display = "none";
		this._restoreCssBackground();
	}

	pause() {
		this.running = false;
	}

	play() {
		this.running = true;
	}

	set(property, value) {
		switch (property) {
			case "dropRadius":
			case "perturbance":
			case "interactive":
			case "crossOrigin":
				this[property] = value;
				break;
			case "imageUrl":
				this.imageUrl = value;
				this.loadImage();
				break;
		}
	}

	// Private helper methods
	_bindTexture(texture, unit = 0) {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
	}

	_drawQuad() {
		const gl = this.gl;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
	}

	_swapBufferIndices() {
		this.bufferWriteIndex = 1 - this.bufferWriteIndex;
		this.bufferReadIndex = 1 - this.bufferReadIndex;
	}

	_extractUrl(value) {
		const match = /url\(["']?([^"']*)["']?\)/.exec(value);
		return match ? match[1] : null;
	}

	_isDataUri(url) {
		return /^data:/.test(url);
	}

	_hideCssBackground() {
		this.originalBackgroundImage = this.element.style.backgroundImage;
		this.element.style.backgroundImage = "none";
	}

	_restoreCssBackground() {
		if (this.originalBackgroundImage !== undefined) {
			this.element.style.backgroundImage = this.originalBackgroundImage;
		}
	}

	_computeTextureBoundaries() {
		const style = window.getComputedStyle(this.element);
		const backgroundSize = style.backgroundSize;
		const backgroundAttachment = style.backgroundAttachment;
		const backgroundPosition = this._translateBackgroundPosition(
			style.backgroundPosition,
		);

		let container;
		if (backgroundAttachment === "fixed") {
			container = {
				left: window.pageXOffset,
				top: window.pageYOffset,
				width: window.innerWidth,
				height: window.innerHeight,
			};
		} else {
			const rect = this.element.getBoundingClientRect();
			container = {
				left: rect.left + window.pageXOffset,
				top: rect.top + window.pageYOffset,
				width: this.element.clientWidth,
				height: this.element.clientHeight,
			};
		}

		let backgroundWidth, backgroundHeight;

		if (backgroundSize === "cover") {
			const scale = Math.max(
				container.width / this.backgroundWidth,
				container.height / this.backgroundHeight,
			);
			backgroundWidth = this.backgroundWidth * scale;
			backgroundHeight = this.backgroundHeight * scale;
		} else if (backgroundSize === "contain") {
			const scale = Math.min(
				container.width / this.backgroundWidth,
				container.height / this.backgroundHeight,
			);
			backgroundWidth = this.backgroundWidth * scale;
			backgroundHeight = this.backgroundHeight * scale;
		} else {
			const sizes = backgroundSize.split(" ");
			let width = sizes[0] || "";
			let height = sizes[1] || width;

			if (this._isPercentage(width)) {
				backgroundWidth = container.width * parseFloat(width) / 100;
			} else if (width !== "auto") {
				backgroundWidth = parseFloat(width);
			}

			if (this._isPercentage(height)) {
				backgroundHeight = container.height * parseFloat(height) / 100;
			} else if (height !== "auto") {
				backgroundHeight = parseFloat(height);
			}

			if (width === "auto" && height === "auto") {
				backgroundWidth = this.backgroundWidth;
				backgroundHeight = this.backgroundHeight;
			} else {
				if (width === "auto") {
					backgroundWidth = this.backgroundWidth *
						(backgroundHeight / this.backgroundHeight);
				}
				if (height === "auto") {
					backgroundHeight = this.backgroundHeight *
						(backgroundWidth / this.backgroundWidth);
				}
			}
		}

		let backgroundX = backgroundPosition[0];
		let backgroundY = backgroundPosition[1];

		if (this._isPercentage(backgroundX)) {
			backgroundX = container.left +
				(container.width - backgroundWidth) * parseFloat(backgroundX) /
					100;
		} else {
			backgroundX = container.left + parseFloat(backgroundX);
		}

		if (this._isPercentage(backgroundY)) {
			backgroundY = container.top +
				(container.height - backgroundHeight) *
					parseFloat(backgroundY) / 100;
		} else {
			backgroundY = container.top + parseFloat(backgroundY);
		}

		const elementRect = this.element.getBoundingClientRect();
		const elementOffset = {
			left: elementRect.left + window.pageXOffset,
			top: elementRect.top + window.pageYOffset,
		};

		this.renderProgram.uniforms.topLeft = new Float32Array([
			(elementOffset.left - backgroundX) / backgroundWidth,
			(elementOffset.top - backgroundY) / backgroundHeight,
		]);

		this.renderProgram.uniforms.bottomRight = new Float32Array([
			this.renderProgram.uniforms.topLeft[0] +
			this.element.clientWidth / backgroundWidth,
			this.renderProgram.uniforms.topLeft[1] +
			this.element.clientHeight / backgroundHeight,
		]);

		const maxSide = Math.max(this.canvas.width, this.canvas.height);
		this.renderProgram.uniforms.containerRatio = new Float32Array([
			this.canvas.width / maxSide,
			this.canvas.height / maxSide,
		]);
	}

	_isPercentage(str) {
		return str && str[str.length - 1] === "%";
	}

	_translateBackgroundPosition(value) {
		const parts = value.split(" ");

		if (parts.length === 1) {
			switch (value) {
				case "center":
					return ["50%", "50%"];
				case "top":
					return ["50%", "0"];
				case "bottom":
					return ["50%", "100%"];
				case "left":
					return ["0", "50%"];
				case "right":
					return ["100%", "50%"];
				default:
					return [value, "50%"];
			}
		}

		return parts.map((part) => {
			switch (part) {
				case "center":
					return "50%";
				case "top":
				case "left":
					return "0";
				case "right":
				case "bottom":
					return "100%";
				default:
					return part;
			}
		});
	}
}
export default Rippler;
