/**
 * Rippler.js v1.0.2 (ESM, Self-contained)
 *
 * A pure JavaScript library for creating interactive WebGL water ripple effects.
 * This is a modern refactoring of the original jquery.ripples plugin.
 *
 * Original author: sirxemic (https://github.com/sirxemic/jquery.ripples)
 * Refactored by: Pixelium, Inc.
 * License: MIT
 */

export default class Rippler {
	// --- Public Static Fields ---
	static DEFAULTS = {
		imageUrl: null,
		resolution: 256,
		dropRadius: 20,
		perturbance: 0.03,
		interactive: true,
		crossOrigin: "",
	};

	// --- Static Private Helper Methods ---
	static #isPercentage = (str) => String(str).endsWith("%");
	static #extractUrl = (value) =>
		/url\(["']?([^"']*)["']?\)/.exec(value)?.[1] || null;
	static #isDataUri = (url) => String(url).startsWith("data:");

	static #loadConfig = () => {
		if (typeof window === "undefined") return null;
		const canvas = document.createElement("canvas");
		const gl = canvas.getContext("webgl") ||
			canvas.getContext("experimental-webgl");
		if (!gl) return null;

		const extensions = {};
		[
			"OES_texture_float",
			"OES_texture_half_float",
			"OES_texture_float_linear",
			"OES_texture_half_float_linear",
		].forEach((name) => {
			const extension = gl.getExtension(name);
			if (extension) extensions[name] = extension;
		});

		if (!extensions.OES_texture_float) return null;

		const createConfig = (type, glType, arrayType) => {
			const name = `OES_texture_${type}`;
			const nameLinear = `${name}_linear`;
			const linearSupport = nameLinear in extensions;
			const configExtensions = [name];
			if (linearSupport) configExtensions.push(nameLinear);
			return {
				type: glType,
				arrayType,
				linearSupport,
				extensions: configExtensions,
			};
		};

		const configs = [createConfig("float", gl.FLOAT, Float32Array)];
		if (extensions.OES_texture_half_float) {
			configs.push(
				createConfig(
					"half_float",
					extensions.OES_texture_half_float.HALF_FLOAT_OES,
					null,
				),
			);
		}

		const texture = gl.createTexture();
		const framebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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
			) return cfg;
		}
		return null;
	};

	static #createImageData = (width, height) => {
		try {
			return new ImageData(width, height);
		} catch {
			const canvas = document.createElement("canvas");
			return canvas.getContext("2d").createImageData(width, height);
		}
	};

	static #translateBackgroundPosition = (value) => {
		const map = {
			center: "50%",
			top: "0",
			bottom: "100%",
			left: "0",
			right: "100%",
		};
		const parts = value.split(" ");
		if (parts.length === 1) {
			return [map[value] || value, "50%"];
		} else {
			return parts.map((part) => map[part] || part);
		}
	};

	static #createProgram = (gl, vertexSource, fragmentSource) => {
		const compileSource = (type, source) => {
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
				throw new Error(
					`Shader compile error: ${gl.getShaderInfoLog(shader)}`,
				);
			}
			return shader;
		};

		const program = { id: gl.createProgram(), locations: {} };
		gl.attachShader(
			program.id,
			compileSource(gl.VERTEX_SHADER, vertexSource),
		);
		gl.attachShader(
			program.id,
			compileSource(gl.FRAGMENT_SHADER, fragmentSource),
		);
		gl.linkProgram(program.id);
		if (!gl.getProgramParameter(program.id, gl.LINK_STATUS)) {
			throw new Error(
				`Shader link error: ${gl.getProgramInfoLog(program.id)}`,
			);
		}

		gl.useProgram(program.id);
		gl.enableVertexAttribArray(0);
		const regex = /uniform (\w+) (\w+)/g;
		let match;
		while ((match = regex.exec(vertexSource + fragmentSource)) !== null) {
			program.locations[match[2]] = gl.getUniformLocation(
				program.id,
				match[2],
			);
		}
		return program;
	};

	static #bindTexture = (gl, texture, unit = 0) => {
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, texture);
	};

	// --- Static Private Fields & Initialization Block ---
	static #globalConfig = Rippler.#loadConfig();
	static #transparentPixels = Rippler.#createImageData(32, 32);

	static {
		if (typeof document !== "undefined") {
			const style = document.createElement("style");
			style.innerHTML = ".rippler { position: relative; z-index: 0; }";
			document.head.prepend(style);
		}
	}

	// --- Private Instance Fields ---
	#el;
	#canvas;
	#context;
	#options;
	#destroyed = false;
	#running = true;
	#visible = true;
	#resolution;
	#textureDelta;
	#interactive;
	#perturbance;
	#dropRadius;
	#crossOrigin;
	#imageUrl;
	#textures = [];
	#framebuffers = [];
	#bufferWriteIndex = 0;
	#bufferReadIndex = 1;
	#quad;
	#dropProgram;
	#updateProgram;
	#renderProgram;
	#backgroundTexture;
	#backgroundWidth = 0;
	#backgroundHeight = 0;
	#imageSource;
	#originalInlineCss;
	#eventHandlers = {};

	constructor(element, options = {}) {
		if (!Rippler.#globalConfig) {
			throw new Error(
				"Your browser does not support WebGL, the OES_texture_float extension, or rendering to floating point textures.",
			);
		}

		this.#el = element;
		this.#options = { ...Rippler.DEFAULTS, ...options };

		({
			interactive: this.#interactive,
			resolution: this.#resolution,
			perturbance: this.#perturbance,
			dropRadius: this.#dropRadius,
			crossOrigin: this.#crossOrigin,
			imageUrl: this.#imageUrl,
		} = this.#options);

		this.#textureDelta = new Float32Array([
			1 / this.#resolution,
			1 / this.#resolution,
		]);

		this.#canvas = document.createElement("canvas");
		this.#canvas.width = this.#el.clientWidth;
		this.#canvas.height = this.#el.clientHeight;
		Object.assign(this.#canvas.style, {
			position: "absolute",
			left: "0",
			top: "0",
			right: "0",
			bottom: "0",
			zIndex: "-1",
		});

		this.#el.classList.add("rippler");
		this.#el.appendChild(this.#canvas);

		this.#context = this.#canvas.getContext("webgl") ||
			this.#canvas.getContext("experimental-webgl");
		if (!this.#context) throw new Error("WebGL not supported");

		const gl = this.#context;
		Rippler.#globalConfig.extensions.forEach((name) =>
			gl.getExtension(name)
		);

		const arrayType = Rippler.#globalConfig.arrayType;
		const textureData = arrayType
			? new arrayType(this.#resolution * this.#resolution * 4)
			: null;

		for (let i = 0; i < 2; i++) {
			const texture = gl.createTexture();
			const framebuffer = gl.createFramebuffer();
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MIN_FILTER,
				Rippler.#globalConfig.linearSupport ? gl.LINEAR : gl.NEAREST,
			);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MAG_FILTER,
				Rippler.#globalConfig.linearSupport ? gl.LINEAR : gl.NEAREST,
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
				this.#resolution,
				this.#resolution,
				0,
				gl.RGBA,
				Rippler.#globalConfig.type,
				textureData,
			);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				texture,
				0,
			);
			this.#textures.push(texture);
			this.#framebuffers.push(framebuffer);
		}

		this.#quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#quad);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
			gl.STATIC_DRAW,
		);

		this.#initShaders();
		this.#initTexture();
		this.#setTransparentTexture();
		this.#loadImage();

		gl.clearColor(0, 0, 0, 0);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		this.#setupPointerEvents();
		requestAnimationFrame(this.#step);
	}

	#step = () => {
		if (this.#destroyed) return;
		if (this.#visible) {
			this.#computeTextureBoundaries();
			if (this.#running) this.#update();
			this.#render();
		}
		requestAnimationFrame(this.#step);
	};

	#updateSize = () => {
		const { clientWidth: newWidth, clientHeight: newHeight } = this.#el;
		if (
			newWidth !== this.#canvas.width || newHeight !== this.#canvas.height
		) {
			this.#canvas.width = newWidth;
			this.#canvas.height = newHeight;
		}
	};

	#setupPointerEvents = () => {
		if (this.#interactive) {
			this.#eventHandlers.pointermove = (e) => this.#dropAtPointer(e);
			this.#eventHandlers.touchmove = (e) => {
				e.preventDefault();
				for (const touch of e.changedTouches) {
					this.#dropAtPointer(touch);
				}
			};
			this.#eventHandlers.pointerdown = (e) => {
				e.preventDefault();
				const touches = e.changedTouches || [e];
				for (const touch of touches) this.#dropAtPointer(touch, true);
			};

			this.#el.addEventListener(
				"mousemove",
				this.#eventHandlers.pointermove,
			);
			this.#el.addEventListener(
				"touchmove",
				this.#eventHandlers.touchmove,
				{ passive: false },
			);
			this.#el.addEventListener(
				"touchstart",
				this.#eventHandlers.pointerdown,
				{ passive: false },
			);
			this.#el.addEventListener(
				"mousedown",
				this.#eventHandlers.pointerdown,
			);
		}

		window.addEventListener("resize", this.#updateSize);
	};

	#loadImage = async () => {
		const gl = this.#context;
		const newImageSource = this.#imageUrl ||
			Rippler.#extractUrl(
				window.getComputedStyle(this.#el).backgroundImage,
			);
		if (newImageSource === this.#imageSource) return;
		this.#imageSource = newImageSource;

		if (!this.#imageSource) {
			this.#setTransparentTexture();
			return;
		}

		try {
			const image = await new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = reject;
				img.crossOrigin = Rippler.#isDataUri(this.#imageSource)
					? null
					: this.#crossOrigin;
				img.src = this.#imageSource;
			});

			const isPowerOfTwo = (x) => (x & (x - 1)) === 0;
			const wrapping =
				isPowerOfTwo(image.width) && isPowerOfTwo(image.height)
					? gl.REPEAT
					: gl.CLAMP_TO_EDGE;
			gl.bindTexture(gl.TEXTURE_2D, this.#backgroundTexture);
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
			this.#backgroundWidth = image.width;
			this.#backgroundHeight = image.height;
			this.#hideCssBackground();
		} catch {
			this.#setTransparentTexture();
		}
	};

	#drawQuad = () => {
		const gl = this.#context;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.#quad);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
	};

	#render = () => {
		// Abort rendering if the uniform data is not yet available.
		if (!this.#renderProgram.uniforms?.topLeft) {
			return;
		}

		const gl = this.#context;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
		gl.enable(gl.BLEND);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.useProgram(this.#renderProgram.id);
		Rippler.#bindTexture(gl, this.#backgroundTexture, 0);
		Rippler.#bindTexture(gl, this.#textures[0], 1);
		gl.uniform1f(
			this.#renderProgram.locations.perturbance,
			this.#perturbance,
		);
		gl.uniform2fv(
			this.#renderProgram.locations.topLeft,
			this.#renderProgram.uniforms.topLeft,
		);
		gl.uniform2fv(
			this.#renderProgram.locations.bottomRight,
			this.#renderProgram.uniforms.bottomRight,
		);
		gl.uniform2fv(
			this.#renderProgram.locations.containerRatio,
			this.#renderProgram.uniforms.containerRatio,
		);
		gl.uniform1i(this.#renderProgram.locations.samplerBackground, 0);
		gl.uniform1i(this.#renderProgram.locations.samplerRipples, 1);
		this.#drawQuad();
		gl.disable(gl.BLEND);
	};

	#update = () => {
		const gl = this.#context;
		gl.viewport(0, 0, this.#resolution, this.#resolution);
		gl.bindFramebuffer(
			gl.FRAMEBUFFER,
			this.#framebuffers[this.#bufferWriteIndex],
		);
		Rippler.#bindTexture(gl, this.#textures[this.#bufferReadIndex]);
		gl.useProgram(this.#updateProgram.id);
		this.#drawQuad();
		this.#swapBufferIndices();
	};

	#swapBufferIndices = () => {
		this.#bufferWriteIndex = 1 - this.#bufferWriteIndex;
		this.#bufferReadIndex = 1 - this.#bufferReadIndex;
	};

	#computeTextureBoundaries = () => {
		// Abort if the background image dimensions are unknown.
		if (this.#backgroundWidth === 0 || this.#backgroundHeight === 0) {
			return;
		}

		const style = window.getComputedStyle(this.#el);
		let backgroundSize = style.backgroundSize;
		const backgroundPosition = Rippler.#translateBackgroundPosition(
			style.backgroundPosition,
		);

		const container = style.backgroundAttachment === "fixed"
			? {
				left: window.scrollX,
				top: window.scrollY,
				width: window.innerWidth,
				height: window.innerHeight,
			}
			: {
				left: this.#el.offsetLeft,
				top: this.#el.offsetTop,
				width: this.#el.offsetWidth,
				height: this.#el.offsetHeight,
			};

		let bgWidth, bgHeight;
		if (backgroundSize === "cover") {
			const scale = Math.max(
				container.width / this.#backgroundWidth,
				container.height / this.#backgroundHeight,
			);
			[bgWidth, bgHeight] = [
				this.#backgroundWidth * scale,
				this.#backgroundHeight * scale,
			];
		} else if (backgroundSize === "contain") {
			const scale = Math.min(
				container.width / this.#backgroundWidth,
				container.height / this.#backgroundHeight,
			);
			[bgWidth, bgHeight] = [
				this.#backgroundWidth * scale,
				this.#backgroundHeight * scale,
			];
		} else {
			backgroundSize = backgroundSize.split(" ");
			bgWidth = backgroundSize[0] || "";
			bgHeight = backgroundSize[1] || bgWidth;
			if (Rippler.#isPercentage(bgWidth)) {
				bgWidth = (container.width * parseFloat(bgWidth)) / 100;
			} else if (bgWidth !== "auto") bgWidth = parseFloat(bgWidth);
			if (Rippler.#isPercentage(bgHeight)) {
				bgHeight = (container.height * parseFloat(bgHeight)) / 100;
			} else if (bgHeight !== "auto") bgHeight = parseFloat(bgHeight);
			if (bgWidth === "auto" && bgHeight === "auto") {
				[bgWidth, bgHeight] = [
					this.#backgroundWidth,
					this.#backgroundHeight,
				];
			} else {
				if (bgWidth === "auto") {
					bgWidth = this.#backgroundWidth *
						(bgHeight / this.#backgroundHeight);
				}
				if (bgHeight === "auto") {
					bgHeight = this.#backgroundHeight *
						(bgWidth / this.#backgroundWidth);
				}
			}
		}

		let [bgX, bgY] = backgroundPosition;
		bgX = Rippler.#isPercentage(bgX)
			? container.left +
				((container.width - bgWidth) * parseFloat(bgX)) / 100
			: container.left + parseFloat(bgX);
		bgY = Rippler.#isPercentage(bgY)
			? container.top +
				((container.height - bgHeight) * parseFloat(bgY)) / 100
			: container.top + parseFloat(bgY);

		const elOffset = this.#el.getBoundingClientRect();
		const renderProgram = this.#renderProgram;
		renderProgram.uniforms = renderProgram.uniforms || {};
		renderProgram.uniforms.topLeft = new Float32Array([
			(elOffset.left + window.pageXOffset - bgX) / bgWidth,
			(elOffset.top + window.pageYOffset - bgY) / bgHeight,
		]);
		renderProgram.uniforms.bottomRight = new Float32Array([
			renderProgram.uniforms.topLeft[0] + this.#el.clientWidth / bgWidth,
			renderProgram.uniforms.topLeft[1] +
			this.#el.clientHeight / bgHeight,
		]);
		const maxSide = Math.max(this.#canvas.width, this.#canvas.height);
		renderProgram.uniforms.containerRatio = new Float32Array([
			this.#canvas.width / maxSide,
			this.#canvas.height / maxSide,
		]);
	};

	#initShaders = () => {
		const gl = this.#context;
		const vertexShader =
			`attribute vec2 vertex; varying vec2 coord; void main() { coord = vertex * 0.5 + 0.5; gl_Position = vec4(vertex, 0.0, 1.0); }`;
		this.#dropProgram = Rippler.#createProgram(
			gl,
			vertexShader,
			`precision highp float; const float PI = 3.141592653589793; uniform sampler2D texture; uniform vec2 center; uniform float radius; uniform float strength; varying vec2 coord; void main() { vec4 info = texture2D(texture, coord); float drop = max(0.0, 1.0 - length(center * 0.5 + 0.5 - coord) / radius); drop = 0.5 - cos(drop * PI) * 0.5; info.r += drop * strength; gl_FragColor = info; }`,
		);
		this.#updateProgram = Rippler.#createProgram(
			gl,
			vertexShader,
			`precision highp float; uniform sampler2D texture; uniform vec2 delta; varying vec2 coord; void main() { vec4 info = texture2D(texture, coord); vec2 dx = vec2(delta.x, 0.0); vec2 dy = vec2(0.0, delta.y); float average = (texture2D(texture, coord - dx).r + texture2D(texture, coord - dy).r + texture2D(texture, coord + dx).r + texture2D(texture, coord + dy).r) * 0.25; info.g += (average - info.r) * 2.0; info.g *= 0.995; info.r += info.g; gl_FragColor = info; }`,
		);
		gl.useProgram(this.#updateProgram.id);
		gl.uniform2fv(this.#updateProgram.locations.delta, this.#textureDelta);
		this.#renderProgram = Rippler.#createProgram(
			gl,
			`precision highp float; attribute vec2 vertex; uniform vec2 topLeft; uniform vec2 bottomRight; uniform vec2 containerRatio; varying vec2 ripplesCoord; varying vec2 backgroundCoord; void main() { backgroundCoord = mix(topLeft, bottomRight, vertex * 0.5 + 0.5); backgroundCoord.y = 1.0 - backgroundCoord.y; ripplesCoord = vec2(vertex.x, -vertex.y) * containerRatio * 0.5 + 0.5; gl_Position = vec4(vertex.x, -vertex.y, 0.0, 1.0); }`,
			`precision highp float; uniform sampler2D samplerBackground; uniform sampler2D samplerRipples; uniform vec2 delta; uniform float perturbance; varying vec2 ripplesCoord; varying vec2 backgroundCoord; void main() { float height = texture2D(samplerRipples, ripplesCoord).r; float heightX = texture2D(samplerRipples, vec2(ripplesCoord.x + delta.x, ripplesCoord.y)).r; float heightY = texture2D(samplerRipples, vec2(ripplesCoord.x, ripplesCoord.y + delta.y)).r; vec3 dx = vec3(delta.x, heightX - height, 0.0); vec3 dy = vec3(0.0, heightY - height, delta.y); vec2 offset = -normalize(cross(dy, dx)).xz; float specular = pow(max(0.0, dot(offset, normalize(vec2(-0.6, 1.0)))), 4.0); gl_FragColor = texture2D(samplerBackground, backgroundCoord + offset * perturbance) + specular; }`,
		);
		gl.useProgram(this.#renderProgram.id);
		gl.uniform2fv(this.#renderProgram.locations.delta, this.#textureDelta);
	};

	#initTexture = () => {
		const gl = this.#context;
		this.#backgroundTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.#backgroundTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	};

	#setTransparentTexture = () => {
		const gl = this.#context;
		gl.bindTexture(gl.TEXTURE_2D, this.#backgroundTexture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			Rippler.#transparentPixels,
		);
	};

	#hideCssBackground = () => {
		const computedBackgroundImage =
			window.getComputedStyle(this.#el).backgroundImage;
		if (computedBackgroundImage && computedBackgroundImage !== "none") {
			this.#originalInlineCss = this.#el.style.backgroundImage;
			this.#el.style.backgroundImage = "none";
		}
	};

	#restoreCssBackground = () => {
		this.#el.style.backgroundImage = this.#originalInlineCss || "";
	};

	#dropAtPointer = (event, big = false) => {
		const { left, top } = this.#el.getBoundingClientRect();
		const { borderLeftWidth, borderTopWidth } = window.getComputedStyle(
			this.#el,
		);
		const x = event.clientX - left - (parseInt(borderLeftWidth) || 0);
		const y = event.clientY - top - (parseInt(borderTopWidth) || 0);
		this.drop(x, y, this.#dropRadius * (big ? 1.5 : 1), big ? 0.14 : 0.01);
	};

	// --- Public Methods ---
	drop(x, y, radius, strength) {
		const gl = this.#context;
		const { clientWidth: elWidth, clientHeight: elHeight } = this.#el;
		const longestSide = Math.max(elWidth, elHeight);
		radius /= longestSide;
		const dropPosition = new Float32Array([
			(2 * x - elWidth) / longestSide,
			(elHeight - 2 * y) / longestSide,
		]);
		gl.viewport(0, 0, this.#resolution, this.#resolution);
		gl.bindFramebuffer(
			gl.FRAMEBUFFER,
			this.#framebuffers[this.#bufferWriteIndex],
		);
		Rippler.#bindTexture(gl, this.#textures[this.#bufferReadIndex]);
		gl.useProgram(this.#dropProgram.id);
		gl.uniform2fv(this.#dropProgram.locations.center, dropPosition);
		gl.uniform1f(this.#dropProgram.locations.radius, radius);
		gl.uniform1f(this.#dropProgram.locations.strength, strength);
		this.#drawQuad();
		this.#swapBufferIndices();
	}

	destroy() {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#running = false;

		// Remove event listeners
		if (this.#interactive) {
			this.#el.removeEventListener(
				"mousemove",
				this.#eventHandlers.pointermove,
			);
			this.#el.removeEventListener(
				"touchmove",
				this.#eventHandlers.touchmove,
			);
			this.#el.removeEventListener(
				"touchstart",
				this.#eventHandlers.pointerdown,
			);
			this.#el.removeEventListener(
				"mousedown",
				this.#eventHandlers.pointerdown,
			);
		}
		window.removeEventListener("resize", this.#updateSize);

		this.#el.classList.remove("rippler");
		this.#el.removeChild(this.#canvas);
		this.#restoreCssBackground();

		// Clean up WebGL resources
		const gl = this.#context;
		gl.deleteBuffer(this.#quad);
		this.#textures.forEach((texture) => gl.deleteTexture(texture));
		this.#framebuffers.forEach((fb) => gl.deleteFramebuffer(fb));
		gl.deleteProgram(this.#dropProgram.id);
		gl.deleteProgram(this.#updateProgram.id);
		gl.deleteProgram(this.#renderProgram.id);
		gl.deleteTexture(this.#backgroundTexture);
	}

	show() {
		this.#visible = true;
		this.#canvas.style.display = "";
		this.#hideCssBackground();
	}
	hide() {
		this.#visible = false;
		this.#canvas.style.display = "none";
		this.#restoreCssBackground();
	}
	pause() {
		this.#running = false;
	}
	play() {
		this.#running = true;
	}

	set(property, value) {
		const settable = {
			dropRadius: (v) => {
				this.#dropRadius = v;
			},
			perturbance: (v) => {
				this.#perturbance = v;
			},
			interactive: (v) => {
				this.#interactive = v;
			},
			crossOrigin: (v) => {
				this.#crossOrigin = v;
			},
			imageUrl: (v) => {
				this.#imageUrl = v;
				this.#loadImage();
			},
		};
		if (settable[property]) settable[property](value);
	}
}
