// Import File System module
const { glob } = require("glob");
const fs = require("fs");

// Read library folder
glob("src/lib/**")
  .then((files) => {
    // Filter for .js files
    files = files.filter((file) => /\.js$/.test(file));

    // Sort script files
    files = files.sort((a, b) => {
      // Convert filenames to lowercase for case-insensitivity
      const lowerA = a.toLowerCase();
      const lowerB = b.toLowerCase();

      // Define priorities in the desired strict order
      const priorities = [
        "start.js",
        "stop.js",
        "clean.js",
        "sync.js",
        "setSyncInterval",
        "setMaxExecutionTime",
      ];

      // Check if either file matches a priority
      const indexA = priorities.findIndex((priority) =>
        lowerA.endsWith(priority),
      );
      const indexB = priorities.findIndex((priority) =>
        lowerB.endsWith(priority),
      );

      // If both files are in the priority list, sort by their order in the priorities array
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      // If only one file is in the priority list, it comes first
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      // Default to alphabetical order for non-priority files
      return lowerA.localeCompare(lowerB);
    });

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
    console.log("Code.gs file updated");
  })
  .catch((err) => {
    console.error("Failed to loop the library folder", err);
    process.exit(1);
  });
