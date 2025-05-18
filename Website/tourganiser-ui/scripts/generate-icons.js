const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const sizes = [16, 24, 32, 64, 192, 512];
const sourceIcon = path.join(__dirname, "../public/assets/logo.svg");
const outputDir = path.join(__dirname, "../public");

async function generateIcons() {
	// Ensure output directory exists
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	// Generate PNG icons
	for (const size of sizes) {
		await sharp(sourceIcon)
			.resize(size, size)
			.png()
			.toFile(path.join(outputDir, `logo${size}.png`));
		console.log(`Generated ${size}x${size} PNG icon`);
	}

	// Generate favicon.ico (includes multiple sizes)
	const faviconSizes = [16, 24, 32, 64];
	const faviconBuffers = await Promise.all(faviconSizes.map((size) => sharp(sourceIcon).resize(size, size).toBuffer()));

	await sharp(faviconBuffers[0]).toFile(path.join(outputDir, "favicon.ico"));
	console.log("Generated favicon.ico");
}

generateIcons().catch(console.error);
