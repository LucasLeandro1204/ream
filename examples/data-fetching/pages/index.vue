<template>
  <div class="page">
    <h1>{{ page.message }}</h1>
    <Nav />
    <button @click="page.count++">{{ page.count }}</button>
  </div>
</template>

<script lang="ts">
export const preload = async () => {
  return {
    data: {
      message: 'hello world',
      count: 0,
    },
  }
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { usePageData } from '@ream/app'
import { useHead } from '@ream/app'
import Nav from '../components/Nav.vue'

const page = usePageData()

useHead({
  title: computed(() => `${page.count} - ${page.message}`),
})
</script>

<style scoped>
.page {
  background-color: red;
}
</style>
