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

const shaderCode = `

struct DataStruct {
    @builtin(position) pos: vec4f,
    @location(0) uvPos: vec2f,
}

@group(0) @binding(0) var sam : sampler;
@group(0) @binding(1) var tex : texture_2d<f32>;

@vertex
fn vertexMain(@location(0) coords: vec2f, @location(1) uvCoords: vec2f) -> DataStruct {
    var outData: DataStruct;
    outData.pos = vec4f(coords, 0.0, 1.0);
    outData.uvPos = uvCoords;
    return outData;
}

@fragment
fn fragmentMain(fragData: DataStruct) -> @location(0) vec4f {
    return textureSample(tex, sam, fragData.uvPos);
}
`;

/** @type {import("npm:@anywidget/types").Render} */
async function render({ model, el }) {
	let { image_bytes, image_width, image_height, width, height } = model.get(
		"_options",
	);

	let image_array = new Uint8ClampedArray(image_bytes.buffer)
	let image_data = new ImageData(image_array, image_width, image_height);

	// create render context
	let { device, context } = await get_render_context({ el, width, height });
	let format = navigator.gpu.getPreferredCanvasFormat();
	context.configure({ device, format });

	// Define vertex data (vertex coordinates and UV coordinates)
	const vertexData = new Float32Array([
	   -1.0,  1.0, 0.0, 0.0,   // First vertex
	   -1.0, -1.0, 0.0, 1.0,   // Second vertex
		1.0,  1.0, 1.0, 0.0,   // Third vertex
		1.0, -1.0, 1.0, 1.0    // Fourth vertex
	]);

	// Create vertex buffer
	const vertexBuffer = device.createBuffer({
		label: "Example vertex buffer",
		size: vertexData.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
	});

	// Write data to buffer
	device.queue.writeBuffer(vertexBuffer, 0, vertexData);

	// Define layout of buffer data
	const bufferLayout = {
		arrayStride: 16,
		attributes: [
		   { format: "float32x2", offset: 0, shaderLocation: 0 },
		   { format: "float32x2", offset: 8, shaderLocation: 1 }
		],
	};

	// Create ImageBitmap from image file
	// const response = await fetch("parrot.jpg");
	// const imageBitmap = await createImageBitmap(await response.blob());

	// Create texture object
	const texture = device.createTexture({
		size: [image_width, image_height, 1],
		format: "rgba8unorm",
		usage:
			GPUTextureUsage.TEXTURE_BINDING |
			GPUTextureUsage.COPY_DST |
			GPUTextureUsage.RENDER_ATTACHMENT
	});

	// Write data to texture
	device.queue.copyExternalImageToTexture(
		{ source: image_data },
		{ texture: texture },
		[image_width, image_height]
	);

	// Create sampler
	const sampler = device.createSampler({
		magFilter: "linear",
		minFilter: "linear",
	});

	// Create the shader module
	const shaderModule = device.createShaderModule({
		label: "Example shader module",
		code: shaderCode
	});

	// Define the rendering procedure
	const renderPipeline = device.createRenderPipeline({
		layout: "auto",
		vertex: {
			module: shaderModule,
			entryPoint: "vertexMain",
			buffers: [bufferLayout]
		},
		fragment: {
			module: shaderModule,
			entryPoint: "fragmentMain",
			targets: [{
				format: format
			}]
		},
		primitive: {
			topology: "triangle-strip"
		}
	});

	// Access the bind group layout
	const bindGroupLayout = renderPipeline.getBindGroupLayout(0);

	// Create the bind group
	let bindGroup = device.createBindGroup({
		layout: bindGroupLayout,
		entries: [{
			binding: 0,
			resource: sampler
		},
		{
			binding: 1,
			resource: texture.createView({
				dimension: "2d",
			})
	   }]
	});

	// Called just before the window is repainted
	function newFrame(currentTime) {
			// Create the command encoder and the render pass encoder
			const encoder = device.createCommandEncoder();
			const renderPass = encoder.beginRenderPass({
				colorAttachments: [{
					view: context.getCurrentTexture().createView(),
					loadOp: "clear",
					clearValue: { r: 0.9, g: 0.9, b: 0.9, a: 1.0 },
					storeOp: "store"
				}]
			});

			// Set the vertex buffer and pipeline
			renderPass.setVertexBuffer(0, vertexBuffer);
			renderPass.setPipeline(renderPipeline);

			// Associate bind group with render pass encoder
			renderPass.setBindGroup(0, bindGroup);

			// Draw vertices
			renderPass.draw(4);
			renderPass.end();

			// Submit the render commands to the GPU
			device.queue.submit([encoder.finish()]);
			window.requestAnimationFrame(newFrame);
		}

		window.requestAnimationFrame(newFrame);

	return () => {
		device.destroy();
	};
}

export default { render };
