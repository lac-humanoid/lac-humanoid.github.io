<template>
  <v-app>
    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script>
export default {
  name: 'App',
}
</script>

<style>
body,
.v-application {
  font-family: 'Google Sans', 'Noto Sans SC', Arial, sans-serif !important;
}

html,
body {
  overflow-x: clip;
  width: 100%;
  position: relative;
}

.v-application {
  overflow-x: clip;
}

.v-container {
  max-width: 100%;
}
</style>
