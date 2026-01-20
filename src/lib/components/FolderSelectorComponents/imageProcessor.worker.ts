import { Jimp } from 'jimp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: Worker = self as any;

interface ProcessImageMessage {
	type: 'process';
	fileData: ArrayBuffer;
	fileName: string;
	filePath: string;
	extension: string;
	mimeType: string;
}

interface ProcessImageResponse {
	type: 'success';
	files: Array<{
		name: string;
		path: string;
		buffer: ArrayBuffer;
		mimeType: string;
	}>;
}

interface ErrorResponse {
	type: 'error';
	error: string;
}

ctx.addEventListener('message', async (e: MessageEvent<ProcessImageMessage>) => {
	try {
		const { fileData, fileName, filePath, mimeType } = e.data;

		// We cannot process other files, and they're not supported anyway
		if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
			ctx.postMessage({
				type: 'success',
				files: [
					{
						name: fileName,
						path: filePath,
						buffer: fileData,
						mimeType
					}
				]
			} as ProcessImageResponse);
			return;
		}

		// Load the file to get the image dimensions
		const image = await Jimp.fromBuffer(fileData, {
			['image/jpeg']: { maxMemoryUsageInMB: 1024 }
		});

		const width = image.width;
		const height = image.height;

		// If width is greater than 10000, we have a problem
		if (width > 10000) {
			console.log(`File ${fileName} has a width of ${width} which is greater than 10000`);
			ctx.postMessage({
				type: 'success',
				files: [
					{
						name: fileName,
						path: filePath,
						buffer: fileData,
						mimeType
					}
				]
			} as ProcessImageResponse);
			return;
		}

		// This means we're all good for just returning the file as is
		if (height < 10000) {
			ctx.postMessage({
				type: 'success',
				files: [
					{
						name: fileName,
						path: filePath,
						buffer: fileData,
						mimeType
					}
				]
			} as ProcessImageResponse);
			return;
		}

		// we need to split the file into multiple chunks, such that each chunk is less than 10000 pixels in height
		const chunks = [];

		let chunkCount = 1;
		while (height / chunkCount > 2500) {
			chunkCount++;
		}
		const chunkHeight = Math.floor(height / chunkCount);
		const lastChunkHeight = height - chunkHeight * (chunkCount - 1);

		for (let i = 0; i < chunkCount - 1; i++) {
			chunks.push(image.clone().crop({ x: 0, y: chunkHeight * i, w: width, h: chunkHeight }));
		}

		chunks.push(
			image.clone().crop({ x: 0, y: chunkHeight * (chunkCount - 1), w: width, h: lastChunkHeight })
		);

		// Now we recreate the files
		const newFiles = [];
		for (const [index, chunk] of chunks.entries()) {
			const indexedName = `${fileName.split('.')[0]}-${index + 1}.png`;
			const buffer = await chunk.getBuffer('image/png');
			// Convert Buffer/Uint8Array to ArrayBuffer
			const arrayBuffer = new Uint8Array(buffer).buffer;
			newFiles.push({
				name: indexedName,
				path: filePath.includes('/')
					? `${filePath.split('/').slice(0, -1).join('/')}/${indexedName}`
					: `${indexedName}`,
				buffer: arrayBuffer,
				mimeType: 'image/png'
			});
		}

		ctx.postMessage({
			type: 'success',
			files: newFiles
		} as ProcessImageResponse);
	} catch (error) {
		ctx.postMessage({
			type: 'error',
			error: error instanceof Error ? error.message : String(error)
		} as ErrorResponse);
	}
});
