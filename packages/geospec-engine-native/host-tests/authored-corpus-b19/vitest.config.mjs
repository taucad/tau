const config = {
  root: process.env.GEOSPEC_CONSUMER_ROOT,
  test: {
    include: ['corpus.vitest.test.mjs'],
    watch: false,
    fileParallelism: false,
  },
};

export default config;
