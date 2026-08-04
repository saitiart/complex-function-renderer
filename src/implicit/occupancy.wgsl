struct IntParams {
    resolution: u32,
    surfaceType: u32,
}

struct FloatParams {
    isolevel: f32,
    scale: f32,
    animateTime: f32,
    rot_xw: f32,
    rot_yw: f32,
    rot_zw: f32,
    pad1: f32,
    pad2: f32,
}

struct U32Array { values: array<u32>, }
struct AtomicCount { count: atomic<u32>, }


struct DispatchArgs {
    x: u32,
    y: u32,
    z: u32,
    activeCount: u32,
}


override BLOCK: u32 = 4u;


const DISPATCH_STRIDE: u32 = 65535u;

@group(0) @binding(0) var<storage, read>       fieldData: array<f32>;
@group(0) @binding(1) var<storage, read_write> blockList: U32Array;
@group(0) @binding(2) var<storage, read_write> blockCount: AtomicCount;
@group(0) @binding(3) var<uniform>             ips: IntParams;
@group(0) @binding(4) var<uniform>             fps: FloatParams;
@group(0) @binding(5) var<storage, read_write> args: DispatchArgs;

var<workgroup> wmin: array<f32, 64>;
var<workgroup> wmax: array<f32, 64>;


@compute @workgroup_size(64)
fn occupancy_main(@builtin(workgroup_id) wg: vec3u,
                  @builtin(local_invocation_index) lid: u32) {
    let res   = ips.resolution;
    let cells = res - 1u;
    let nb    = (cells + BLOCK - 1u) / BLOCK;

    
    let bx = wg.x;
    let by = wg.y;
    let bz = wg.z % nb;
    let bw = wg.z / nb;
    if (bx >= nb || by >= nb || bz >= nb || bw >= nb) { return; }

    let sY = res;
    let sZ = res * res;
    let sW = sZ * res;

    let span  = BLOCK + 1u;
    let total = span * span * span * span;

    var lo =  3.4e38;
    var hi = -3.4e38;

    for (var i = lid; i < total; i += 64u) {
        var t = i;
        let ci = t % span; t = t / span;
        let cj = t % span; t = t / span;
        let ck = t % span; t = t / span;
        let cl = t;

        
        let x = min(bx * BLOCK + ci, res - 1u);
        let y = min(by * BLOCK + cj, res - 1u);
        let z = min(bz * BLOCK + ck, res - 1u);
        let w = min(bw * BLOCK + cl, res - 1u);

        let v = fieldData[x + y * sY + z * sZ + w * sW];
        lo = min(lo, v);
        hi = max(hi, v);
    }

    wmin[lid] = lo;
    wmax[lid] = hi;
    workgroupBarrier();

    for (var s = 32u; s > 0u; s >>= 1u) {
        if (lid < s) {
            wmin[lid] = min(wmin[lid], wmin[lid + s]);
            wmax[lid] = max(wmax[lid], wmax[lid + s]);
        }
        workgroupBarrier();
    }

    if (lid == 0u) {
        let iso = fps.isolevel;
        
        if (wmin[0] < iso && wmax[0] >= iso) {
            let slot = atomicAdd(&blockCount.count, 1u);
            if (slot < arrayLength(&blockList.values)) {
                blockList.values[slot] = bx + by * nb + bz * nb * nb + bw * nb * nb * nb;
            }
        }
    }
}

@compute @workgroup_size(1)
fn build_args_main() {
    let n      = atomicLoad(&blockCount.count);
    let capped = min(n, arrayLength(&blockList.values));
    args.x = min(capped, DISPATCH_STRIDE);
    args.y = (capped + DISPATCH_STRIDE - 1u) / DISPATCH_STRIDE;
    args.z = 1u;
    args.activeCount = capped;
}