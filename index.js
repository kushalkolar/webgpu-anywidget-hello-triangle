/// <reference types="npm:@webgpu/types" />

/** @param {{ el: HTMLElement, width: number, height: number }} options */
async function get_render_context({ el, width, height }) {
	let adapter = await navigator.gpu.requestAdapter();
	let device = await adapter?.requestDevice();
	let canvas = el?.querySelector("canvas") ?? (() => {
		let canvas = document.createElement("canvas");
		el?.appendChild(canvas);
		return canvas;
	})();
	canvas.width = width;
	canvas.height = height;
	let context = canvas.getContext("webgpu");
	if (!context || !device) {
		throw new Error("WebGPU not supported");
	}
	return { device, context, canvas };
}

	const shader_triangle = `\
		struct DataStruct {
			@builtin(position) pos: vec4f,
			@location(0) colors: vec3f,
		}
		
		@vertex
		fn vertexMain(@location(0) coords: vec2f, @location(1) colors: vec3f) -> DataStruct {
			var outData: DataStruct;
			outData.pos = vec4f(coords, 0.0, 1.0);
			outData.colors = colors;
			return outData;
		}
		
		@fragment
		fn fragmentMain(fragData: DataStruct) -> @location(0) vec4f {
			return vec4f(fragData.colors, 1.0);
		}
		`;

/** @type {import("npm:@anywidget/types").Render} */
async function render({ model, el }) {
	let { width, height } = model.get(
		"_options",
	);

	// create render context
	let { device, context } = await get_render_context({ el, width, height });
	let format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format });

	// create the command encoder
	const encoder = device.createCommandEncoder();
	if (!encoder) {
		throw new Error("Failed to create CommandEncoder");
	}

	// create render pass encoder
	const render_pass = encoder.beginRenderPass({
		colorAttachments: [{
			view: context.getCurrentTexture().createView(),
											   loadOp: "clear",
											   clearValue: { r: 0.9, g: 0.9, b: 0.9, a: 1.0 },
											   storeOp: "store"
		}]
	});

	// triangle vertices
	const vertices = new Float32Array([
		0.0, 0.5, 0.0, 1.0, 0.0,    // First vertex
		-0.5, -0.5, 1.0, 0.0, 0.0,  // Second vertex
		0.5, -0.5, 0.0, 0.0, 1.0    // Third vertex
	]);
	const vertex_buffer = device.createBuffer({
		label: "Example vertex buffer",
		size: vertices.byteLength,
		usage:
		GPUBufferUsage.VERTEX |
		GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(vertex_buffer, 0, vertices);
	render_pass.setVertexBuffer(0, vertex_buffer);

	// shader module
	const module = device.createShaderModule({
		label: "triangle shader",
		code: shader_triangle
	});

	// setup pipeline
	const render_pipeline = device.createRenderPipeline({
		layout: "auto",
		vertex: {
			module: module,
			entryPoint: "vertexMain",
			buffers: [{
				arrayStride: 20,
				attributes: [
					{ format: "float32x2", offset: 0, shaderLocation: 0 },
					{ format: "float32x3", offset: 8, shaderLocation: 1 }
				]
			}]
		},
		fragment: {
			module: module,
			entryPoint: "fragmentMain",
			targets: [{
				format: format
			}]
		}
	});
	render_pass.setPipeline(render_pipeline);

	render_pass.draw(3);
	render_pass.end();

	/// submit commands
	device.queue.submit([encoder.finish()]);

	return () => {
		device.destroy();
	};
}

export default { render };
