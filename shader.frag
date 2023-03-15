precision mediump float;
uniform vec2 u_resolution;

void main() {
    float colorValue = (gl_FragCoord.x + gl_FragCoord.y) / (u_resolution.x + u_resolution.y);
    gl_FragColor = vec4(vec3(colorValue), 1);
}
