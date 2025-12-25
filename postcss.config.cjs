// postcss.config.cjs
module.exports = {
  plugins: {
    // tailwindcss 대신 @tailwindcss/postcss 를 사용합니다.
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
