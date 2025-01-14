// Import File System module
const { glob } = require("glob");
const fs = require("fs");

// Read library folder
glob("lib/**")
  .then((files) => {
    // Filter for .js files
    files = files.filter((file) => /\.js$/.test(file));

    // Filter out onCalendarUpdate.js file
    files = files.filter((file) => !/onCalendarUpdate\.js$/.test(file));

    // Start array of code blocks
    const codeBlocks = [];

    // Add date and link
    const now = new Date();
    const date = now.toISOString().substr(0, 10);
    const link =
      "https://github.com/scriptPilot/google-calendar-synchronization";
    codeBlocks.push(
      `// Google Calendar Synchronization, build on ${date}\n// Source: ${link}\n`,
    );

    // Loop files
    files.forEach((file) => {
      // Read file content
      const fileContent = fs.readFileSync(file, { encoding: "utf8" });

      // Add file content to code blocks
      codeBlocks.push(fileContent);
    });

    // Create a dist folder if not exist
    if (!fs.existsSync("dist")) fs.mkdirSync("dist");

    // Merge and write code blocks to Code.gs file
    fs.writeFileSync("dist/Code.gs", codeBlocks.join("\n"));

    // Log script completion
    console.log("Code.gs file updated.");
  })
  .catch((err) => {
    console.error("Failed to loop the library folder.", err);
    process.exit(1);
  });
