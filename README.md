# Complex 4D Visualizer

Real-time visualization of explicit and implicit complex functions in four
dimensions, running in the browser on WebGPU compute shaders. Explicit
functions are embedded directly in R⁴, with Riemann sphere and S²×S² product
compactifications available; implicit relations are extracted as isosurfaces
of a 4D field via a marching-tesseract scheme, in point-cloud and connected-mesh
form.

Accompanying paper: **Rendering Explicit and Implicit Complex Functions in 4D:
A WebGPU-Based Approach**, Web3D '26.

## Getting Started

```bash
npm install
npm run dev
```

## Browser Requirements

WebGPU is required. Supported on all major browsers except Firefox; a
Chromium-based browser is recommended. For integrated GPU's, for some 
reason Mozilla Firefox is more stable.

The following flags should be enabled:

- **Unsafe WebGPU Support** — `enabled`
- **WebGPU Developer Features** — `enabled`
- **enable-vulkan** — `enabled` (Linux only)

## Project Structure

If you're interested in the mathematical core of the project, the key files are:

| File | Description |
|------|-------------|
| `src/engine/render/compute/complex4d.wgsl` | Core 4D logic |
| `src/engine/render/compute/complex-functions.wgsl` | Library of complex functions used in the visualizations |
| `src/implicit/evaluator.wgsl` | Marching-tesseract extraction |
| `src/implicit/hypercube-march.wgsl` | Freudenthal Triangulation Code |
| `src/implicit/marching-pong.wgsl` | Implicit Point-Cloud Generation |


Most other files are generic rendering pipeline elements and are less relevant
to the mathematics.

## TODO

The next step is parsing input and converting the project into a full complex graphing calculator; A good start would be the Algebrite library. 
Additional improvements are bounding-boxes with annotated axes. In the future, visualizing more advanced topics 
from Complex Analysis like contour integration is planned. Long term we hope this can be an open-source Desmos alternative, as the pipeline is modular enough 
to accommodate normal functions as-well.

## Citation

> Admir Huseini and Art Saiti. 2026. Rendering Explicit and Implicit Complex
> Functions in 4D: A WebGPU-Based Approach. In The 31th International
> Conference on 3D Web Technology (Web3D ’26), October 13–15, 2026, Doha,
> Qatar. ACM, New York, NY, USA, 10 pages. https://doi.org/10.1145/3822516.
> 3834886

## Authors

Art Saiti — WebGPU architecture,  marching-tesseract extraction,
simplicial connectivity scheme; repository maintainer

Admir Huseini — numerical methods, S²×S² compactification, mathematical
formulation

## License

MIT
