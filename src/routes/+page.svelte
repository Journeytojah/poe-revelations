<script>

	import { goto } from "$app/navigation";

</script>
<div class="container">
  <div class="row">
    <div class="w-1/3 self-center text-center align-middle content-center h-1/2 m-auto flex flex-col">
      <h1 class="h1">Path of Exile Revelations</h1>
      <span class="text-sm my-4">
        A tool to browse the game data of Path of Exile, mainly intended for use by wiki editors.
      </span>
      <button on:click={() => goto("/browse")} class="btn variant-outline-tertiary">
        Get started
      </button>
    </div>
  </div>
</div>