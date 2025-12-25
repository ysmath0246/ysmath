// 프로젝트 루트/tailwind.config.js
module.exports = {
    content: [
      "./index.html",
      "./src/**/*.{js,jsx,ts,tsx}"
    ],
    theme: {
      extend: {
        colors: {
          primary:   "#1E3A8A",
          secondary: "#2563EB",
          accent:    "#FBBF24"
        }
      }
    },
    plugins: []
  };
  