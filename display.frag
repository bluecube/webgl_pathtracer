#version 300 es

precision mediump float;

uniform vec2 u_resolution;
uniform sampler2D u_texture;
out vec4 o_fragColor;

void main() {
    //o_fragColor = vec4(gl_FragCoord.xy / u_resolution, 0, 1);
    o_fragColor = texture(u_texture, gl_FragCoord.xy / u_resolution);
}
