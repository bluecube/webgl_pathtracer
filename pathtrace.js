"use strict";

const totalSampleCount = 2000; // How many samples per pixel to calculate
const iterationSampleCount = 5; // How many samples per pixel to calculate per iteration

function downloadFile(f) {
    return fetch(f).then(result => result.text());
}

function crossProduct(v1, v2) {
    return [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
    ];
}

function normalize(v) {
    var len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len === 0) {
        return [0, 0, 0];
    }
    return [v[0] / len, v[1] / len, v[2] / len];
}

function scale(v, s) {
    return v.map(x => x * s);
}

class Pathtrace {
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS))
            throw Error('Shader compilation error: ' + this.gl.getShaderInfoLog(shader));
        return shader;
    }

    createProgram(shaders) {
        const renderProgram = this.gl.createProgram();
        shaders.forEach(s => this.gl.attachShader(renderProgram, s));
        this.gl.linkProgram(renderProgram);
        if (!this.gl.getProgramParameter(renderProgram, this.gl.LINK_STATUS))
            throw Error('Program linking error: ' + this.gl.getProgramInfoLog(renderProgram));
        return renderProgram;
    }

    /**
     * Calculate camera forward, up and right vectors from a forward vector.
     * Outputs are mutually perpendicular, camera is oriented going up along the Z axis.
     * Forward is scaled by forwardScale, up and right are by upRightScale.
     */
    static calculateCamera(origin, forward, forwardScale, upRightScale) {
        const right = normalize(crossProduct(forward, [0, 0, 1]));
        const up = normalize(crossProduct(right, forward));
        return [
            origin,
            scale(normalize(forward), forwardScale),
            scale(up, upRightScale),
            scale(right, upRightScale)
        ];
    }

    /**
     * Return a promise that takes the value of the #canvas element once the window is loaded.
     */
    static findCanvas() {
        return new Promise((resolve, reject) => {
            window.addEventListener("load", resolve)
        }).then(() => document.getElementById("canvas"));
    }

    /**
     * Return a pair of width and height.
     * Returns CSS pixels, because they correspond to the "useful" resolution better
     * than real pixels (on Android!)
     */
    getCanvasSize() {
        // as close as possible to the actual canvas pixel size
        //const dpr = window.devicePixelRatio;
        //const {width, height} = this.canvas.getBoundingClientRect();
        //return [Math.round(width * dpr), Math.round(height * dpr)];

        const {width, height} = this.canvas.getBoundingClientRect();
        return [Math.round(width), Math.round(height)];
    }

    /**
     * Finds all active uniforms in the program and collects their locations in
     * renderUniforms map.
     */
    findUniforms(program) {
        const count = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS);
        var ret = new Map();

        for (let i = 0; i < count; i++) {
            const name = this.gl.getActiveUniform(program, i).name;
            ret.set(name, this.gl.getUniformLocation(program, name));
        }

        return ret;
    }

    /**
     * Set camera control vectors in the uniform attributes
     */
    setupCameraUniforms(origin, forward, up, right) {
        this.gl.uniform2f(this.renderUniforms.get("u_resolution"), this.width, this.height);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraOrigin"), origin);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraForward"), forward);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraUp"), up);
        this.gl.uniform3fv(this.renderUniforms.get("u_cameraRight"), right);
    }

    /**
     * Set the seed value for random generation in the kernel.
     * This is really not critical at all, so we just use Math.random(), hopefully
     * extended to 32bit.
     */
    setupSeedUniform() {
        const seed = (Math.random() * 2**32) >>> 0;
        this.gl.uniform1ui(this.renderUniforms.get("u_seed"), seed);
    }

    createTextures(w, h) {
        // First delete old textures if there are any
        this.textures.forEach(texture => this.gl.deleteTexture(texture));
        this.textures = []

        for (var i = 0; i < 2; i++) {
            const texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0 /*level*/, this.gl.RGBA32F,
                this.width, this.height, 0,
                this.gl.RGBA, this.gl.FLOAT, null
            );

            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

            this.textures.push(texture);
        }
    }

    request_frame() {
        window.requestAnimationFrame(this.run_iteration.bind(this));
    }

    restart() {
        const [w, h] = this.getCanvasSize();
        if (w == this.width && h == this.height) {
            console.log("Unnecessary restart, this should not happen")
            return;
        }
        console.log(`Resized to ${w}x${h}`)
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;

        this.createTextures();

        this.samplesProcessed = 0;
        this.sourceTextureIndex = 0;

        this.cameraParams = Pathtrace.calculateCamera(
            [0, 0, 1.8], // Camera origin
            [0, 1, -0.1], // Forward direction
            1.5, // Forward scale (=focal length)
            1 / Math.min(this.width, this.height)
        );

        this.request_frame();
    }

    runProgram(program, displayTitle) {
        this.gl.viewport(0, 0, this.width, this.height);

        const startTime = performance.now();
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        this.gl.finish();
        const elapsed = performance.now() - startTime;
        return elapsed;
    }

    render(inputTexture, outputTexture) {
        this.gl.useProgram(this.renderProgram);

        this.samplesProcessed += iterationSampleCount;

        this.setupSeedUniform();
        this.setupCameraUniforms(...this.cameraParams);
        this.gl.uniform1f(this.renderUniforms.get("u_iterationUpdateWeight"), iterationSampleCount / this.samplesProcessed);
        this.gl.uniform1ui(this.renderUniforms.get("u_sampleCount"), iterationSampleCount);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fb);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, outputTexture, 0);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, inputTexture);
        this.gl.uniform1i(this.displayUniforms.get("u_previousIterTexture"), 0);

        const elapsed = this.runProgram(this.renderProgram);
        if (Math.floor(this.samplesProcessed / 100) != Math.floor((this.samplesProcessed - iterationSampleCount) / 100))
            console.log(`${this.samplesProcessed}/${totalSampleCount}, ${elapsed / iterationSampleCount} ms/(sample*screen), ${1e6 * elapsed / (iterationSampleCount * this.width * this.height)} ns/sample`);
        return elapsed;
    }

    display(displayTexture) {
        this.gl.useProgram(this.displayProgram);

        this.gl.uniform2f(this.displayUniforms.get("u_resolution"), this.width, this.height);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, displayTexture);
        this.gl.uniform1i(this.displayUniforms.get("u_texture"), 0);

        return this.runProgram(this.displayProgram);
    }

    run_iteration(timestamp) {
        this.lastIterationTimestamp = timestamp;

        const targetTextureIndex = 1 - this.sourceTextureIndex;

        this.render(this.textures[this.sourceTextureIndex], this.textures[targetTextureIndex]);
        this.display(this.textures[targetTextureIndex]);

        this.sourceTextureIndex = targetTextureIndex;

        if (this.samplesProcessed < totalSampleCount)
            this.request_frame();
    }

    async main() {
        let vertexShaderPromise = downloadFile("shader.vert");
        let fragmentShaderPromise = downloadFile("shader.frag");
        let displayShaderPromise = downloadFile("display.frag");

        this.canvas = await Pathtrace.findCanvas();
        this.gl = this.canvas.getContext('webgl2');
        if (this.gl === null)
            throw Error("Couldn't get webgl2 context");

        if (this.gl.getExtension("EXT_color_buffer_float") === null)
            throw Error("Couldn't get EXT_color_buffer_float extension");

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, await vertexShaderPromise);

        const displayShader = this.createShader(this.gl.FRAGMENT_SHADER, await displayShaderPromise);
        this.displayProgram = this.createProgram([vertexShader, displayShader]);
        this.displayUniforms = this.findUniforms(this.displayProgram);

        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, await fragmentShaderPromise);
        this.renderProgram = this.createProgram([vertexShader, fragmentShader]);
        this.renderUniforms = this.findUniforms(this.renderProgram);

        this.fb = this.gl.createFramebuffer();

        this.gl.clearColor(0, 0, 0, 0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.textures = []

        this.restart();

        window.addEventListener("resize", this.restart.bind(this));
    }

}

var pt = new Pathtrace();
pt.main();
