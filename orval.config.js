module.exports = {
  api: {
    input: "./api/openapi.json",
    output: {
      mode: "tags-split",
      target: "./lib/api/api.ts",
      client: "axios",
      mock: false,
      react: {
        useQuery: true,
        queryOptions: {
          staleTime: 5 * 60 * 1000, // Время устаревания данных (5 минут)
        },
      },
      override: {
        mutator: {
          path: "lib/axios-instance.ts",
          name: "customInstance",
        },
      },
    },
    hooks: {
      afterAllFilesWrite: ["prettier --write"], // Автоформатирование после генерации
    },
  },
}
