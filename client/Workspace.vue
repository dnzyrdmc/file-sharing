<script setup>
import { ref, onMounted } from "vue";
import { api, act, base64 } from "./api";
const origin = window.location.origin;
const files = ref([]),
  selected = ref(null),
  progress = ref(0),
  busy = ref(false),
  share = ref("");
async function load() {
  files.value = await api("/files");
}
async function upload() {
  const f = selected.value;
  if (!f) throw new Error("Dosya seç");
  if (!f.size || f.size > 8 * 1024 * 1024)
    throw new Error("Dosya 1 bayt - 8 MB arasında olmalı");
  busy.value = true;
  progress.value = 0;
  try {
    const total = Math.ceil(f.size / 262144),
      u = await api("/uploads", "POST", { name: f.name, size: f.size, total });
    for (let i = 0; i < total; i++) {
      await api("/uploads/" + u.id + "/parts/" + i, "PUT", {
        base64: await base64(
          new File([f.slice(i * 262144, (i + 1) * 262144)], f.name),
        ),
      });
      progress.value = Math.round(((i + 1) / total) * 100);
    }
    await api("/uploads/" + u.id + "/complete", "POST", {});
    await load();
  } finally {
    busy.value = false;
  }
}
onMounted(() => act(load, ""));
</script>
<template>
  <form class="panel" @submit.prevent="act(upload, 'Dosya kaydedildi')">
    <h2>Parçalı yükleme</h2>
    <label
      >Dosya · en fazla 8 MB<input
        type="file"
        @change="selected = $event.target.files[0]" /></label
    ><button :disabled="busy">
      {{ busy ? "Yükleniyor..." : "Dosyayı yükle" }}
    </button>
    <div class="bar"><i :style="{ width: progress + '%' }"></i></div>
    <small
      >{{ progress }}% · 256 KB parçalar · tekrar gönderilen parça aynı sırayı
      günceller</small
    >
  </form>
  <div v-if="share" class="alert">
    <a :href="share" target="_blank">1 saatlik paylaşım bağlantısını aç</a>
    <p style="overflow-wrap: anywhere">{{ share }}</p>
  </div>
  <section class="panel">
    <h2>Dosyalarım</h2>
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Ad</th>
            <th>Boyut</th>
            <th>Durum</th>
            <th>İşlem</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in files">
            <td>{{ f.name }}</td>
            <td>{{ (f.size / 1024).toFixed(1) }} KB</td>
            <td>{{ f.status }}</td>
            <td>
              <div class="actions">
                <a
                  v-if="f.status === 'ready'"
                  :href="'/api/files/' + f.id + '/download'"
                  >İndir</a
                ><button
                  v-if="f.status === 'ready'"
                  class="small"
                  @click="
                    act(async () => {
                      share =
                        origin +
                        (await api('/files/' + f.id + '/share', 'POST', {}))
                          .path;
                    }, 'Paylaşım hazır')
                  "
                >
                  Paylaş</button
                ><button
                  class="ghost small"
                  @click="
                    act(async () => {
                      await api('/files/' + f.id, 'DELETE');
                      await load();
                      share = '';
                    })
                  "
                >
                  Sil
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!files.length" class="empty">Henüz dosya yok.</p>
  </section>
</template>
