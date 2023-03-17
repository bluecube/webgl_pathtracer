#version 300 es

precision mediump float;

// Sentinel value for not finding any intersection
const float FAR_AWAY = 1e9;
const float EPSILON = 1e-6;
const float TWO_PI = 6.283185307179586;
const uint SAMPLE_COUNT = 100u;
const uint DEPTH = 10u;

const int MatSolidWhite = 1;
const int MatGlowing = 2;
const int MatGrid = 3;
const int MatRed = 4;

uniform vec2 u_resolution;
uniform vec3 u_cameraOrigin;
uniform vec3 u_cameraForward;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
out vec4 o_fragColor;

uint rngState;

struct Ray {
    vec3 origin;
    vec3 direction; // must be normalized
};

struct IntersectionResult {
    float distance;
    vec3 normal;
    vec3 pos;
    int material;
};

struct MaterialSample {
    vec3 reflection;
    vec3 emission;
    vec3 nextSampleDirection;
};

/// Generate two arbitrary vectors that form an orthonormal basis with v1.
/// Based on https://graphics.pixar.com/library/OrthonormalB/paper.pdf
void orthonormal_basis(vec3 v1, out vec3 v2, out vec3 v3) {
    float sign = (v1.z >= 0.0 ? 1.0 : 0.0);
    float a = -1.0 / (sign + v1.z);
    float b = v1.x * v1.y * a;
    v2 = vec3(1.0 + sign * v1.x * v1.x * a, sign * b, -sign * v1.x);
    v3 = vec3(b, sign + v1.y * v1.y * a, -v1.y);
}

/// Taken from https://www.reedbeta.com/blog/hash-functions-for-gpu-rendering/
uint rand_pcg() {
    uint state = rngState;
    rngState = rngState * 747796405u + 2891336453u;
    uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

void seed_pcg(uint seed) {
    rngState = 0u;
    rand_pcg();
    rngState += seed;
    rand_pcg();
}

/// Generate random float in <0, 1)
float rand_float() {
    return float(rand_pcg()) / (float(~0u) + 1.0);
}

/// Generate two random floats in <0, 1)
vec2 rand_vec2() {
    return vec2(rand_float(), rand_float());
}

/// Generate a random unit vector on a hemispherical surface centered around +Z.
/// The random points are cosine weighted.
/// Based on https://www.rorydriscoll.com/2009/01/07/better-sampling/
vec3 rand_cosine_weighted_hemispherical_surface_along_z() {
    float a = rand_float();
    float r = sqrt(a);
    float theta = TWO_PI * rand_float();
    return vec3(r * cos(theta), r * sin(theta), sqrt(1.0 - a));
}

/// Generate a random unit vector on a hemispherical surface centered around `direction`.
/// Direction must be normalized.
/// The random points are cosine weighted.
vec3 rand_cosine_weighted_hemispherical_surface(vec3 direction) {
    vec3 base1, base2;
    orthonormal_basis(direction, base1, base2);
    vec3 x = rand_cosine_weighted_hemispherical_surface_along_z();
    return direction * x.z + base1 * x.y + base2 * x.x;
}

IntersectionResult ray_sphere_intersection(vec3 center, float radius, Ray ray) {
    vec3 oc = ray.origin - center;
    float b_half = dot(oc, ray.direction);
    float c = dot(oc, oc) - radius * radius;
    float discriminant = b_half * b_half - c;
    if (discriminant < 0.0) {
        IntersectionResult ret;
        ret.distance = FAR_AWAY;
        return ret;
    } else {
        IntersectionResult ret;
        ret.distance = (-b_half - sqrt(discriminant));
        ret.pos = ray.origin + ret.distance * ray.direction;
        ret.normal = (ret.pos - center) / radius;
        return ret;
    }
}

IntersectionResult ray_plane_intersection(vec3 point, vec3 normal, Ray ray) {
    IntersectionResult ret;
    ret.distance = dot(point - ray.origin, normal) / dot(ray.direction, normal);
    ret.pos = ray.origin + ret.distance * ray.direction;
    ret.normal = normal;
    return ret;
}

/// Möller–Trumbore ray-triangle intersection algorithm
/// Modified from https://github.com/erich666/jgt-code/blob/master/Volume_02/Number_1/Moller1997a/raytri.c
IntersectionResult ray_triangle_intersection(vec3 vert0, vec3 edge1, vec3 edge2, Ray ray) {
    IntersectionResult ret;
    ret.distance = FAR_AWAY;

    vec3 pvec = cross(ray.direction, edge2);

    float det = dot(edge1, pvec);

    if (det > -1e-6 && det < 1e-6)
        return ret; // ray is parallell to the plane of the triangle
        // TODO: This if det is very small, invDet will be very lareg and the u
        // and v tests will fail later. This branch is probably not necessary

    float invDet = 1.0 / det;

    // calculate distance from vert0 to ray origin
    vec3 tvec = ray.origin - vert0;

    // calculate U parameter and test bounds
    float u = dot(tvec, pvec) * invDet;
    if (u < 0.0 || u > 1.0)
        return ret; // TODO: Try adding some combination `step()` of `u` * FAR_AWAY to the result instead of returning early

    // prepare to test V parameter
    vec3 qvec = cross(tvec, edge1);

    // calculate V parameter and test bounds
    float v = dot(ray.direction, qvec) * invDet;
    if (v < 0.0 || u + v > 1.0)
        return ret; // TODO: As above, get rid of branch

    // calculate t, ray intersects triangle
    ret.distance = dot(edge2, qvec) * invDet;
    ret.normal = normalize(cross(edge1, edge2));
    ret.pos = ray.origin + ret.distance * ray.direction;
    return ret;
}

IntersectionResult ray_scene_intersection(Ray ray) {
    IntersectionResult ret;
    ret.distance = FAR_AWAY;

#define OBJ(intersectionFn, mat) \
    { \
        IntersectionResult objResult = (intersectionFn); \
        if (objResult.distance > EPSILON && objResult.distance < ret.distance) { \
            ret = objResult; \
            ret.material = (mat); \
        } \
    }

    // bottom sphere
    OBJ(ray_sphere_intersection(vec3(-1.0, 5, 0.5), 0.5, ray), MatSolidWhite);

    // top sphere
    OBJ(ray_sphere_intersection(vec3(-1.0, 5, 1.5), 0.5, ray), MatGlowing);

    // floor
    OBJ(ray_plane_intersection(vec3(0.0), vec3(0.0, 0.0, 1.0), ray), MatGrid);

    // a random triangle
    OBJ(ray_triangle_intersection(vec3(1.0, 4.0, 1.2), vec3(-1.0, 1.0, 0.0), vec3(0.0, 0.0, -1.2), ray), MatRed);

#undef OBJ

    return ret;
}

/// Return 1.0 if point p is within halfLineThickness of axis aligned square grid.
float square_grid(vec2 p, float size, float halfLineThickness) {
    p = p / size;
    vec2 cellCoords = p - floor(p);
    vec2 border = step(cellCoords, vec2(halfLineThickness)) + step(vec2(1.0 - halfLineThickness), cellCoords);
    return max(border.x, border.y);
}

/// Evaluate a material at a given intersection
MaterialSample sample_material(Ray ray, IntersectionResult intersection) {
    MaterialSample ret;
    ret.nextSampleDirection = rand_cosine_weighted_hemispherical_surface(intersection.normal);
    ret.emission = vec3(0);

    if (intersection.material == MatGlowing) {
        ret.emission = vec3(1.2, 1.11, 1.05) * 1.0 * max(0.0, dot(intersection.normal, -ray.direction));
        ret.reflection = vec3(0.5);
    } else if (intersection.material == MatGrid) {
        float onGrid = square_grid(intersection.pos.xy, 0.5, 0.02);
        ret.emission = onGrid * vec3(0.0, 0.1, 0); // The green lines glow a bit!
        ret.reflection = vec3(0.9);//mix(vec3(0.4), vec3(0.1), onGrid);
    } else if (intersection.material == MatRed) {
        ret.reflection = vec3(0.7, 0.0, 0.0);
    } else {
        ret.reflection = vec3(0.5);
    }

    return ret;
}

Ray make_camera_ray(vec2 pixelPosition) {
    pixelPosition -= u_resolution / 2.0;
    pixelPosition += rand_vec2();

    Ray ret;
    ret.origin = u_cameraOrigin;
    ret.direction = normalize(
        u_cameraForward +
        u_cameraRight * pixelPosition.x +
        u_cameraUp * pixelPosition.y
    );

    return ret;
}

/// Trace a single ray into the scene, return color collected
vec3 trace_ray(Ray ray) {
    vec3 color = vec3(0);
    vec3 weight = vec3(1);

    for (uint j = 0u; j < DEPTH; ++j) {
        IntersectionResult intersection = ray_scene_intersection(ray);
        if (intersection.distance >= FAR_AWAY) {
            color += weight * vec3(0.2); // Some ambient difuse light
            break;
        }

        MaterialSample material = sample_material(ray, intersection);

        color += weight * material.emission;
        weight *= material.reflection;
        ray.origin = intersection.pos;
        ray.direction = material.nextSampleDirection;
    }

    return color;
}

/// Trace all samples of the single pixel, return final color
vec3 render_pixel(vec2 pixelPosition) {
    vec3 color = vec3(0.0);
    for (uint i = 0u; i < SAMPLE_COUNT; ++i) {
        Ray ray = make_camera_ray(pixelPosition);
        color += trace_ray(ray);
    }
    return color / float(SAMPLE_COUNT);
}

void main() {
    seed_pcg(uint(gl_FragCoord.x) + uint(gl_FragCoord.y) * uint(u_resolution.x));

    o_fragColor = vec4(render_pixel(gl_FragCoord.xy), 1.0);
}
