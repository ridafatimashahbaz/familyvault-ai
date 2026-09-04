/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          500: "#3358e0",
          600: "#2745c2",
          700: "#1f379b",
        },
      },
    },
  },
  plugins: [],
};
