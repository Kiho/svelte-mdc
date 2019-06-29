<script>
  import {
    afterUpdate,
    createEventDispatcher,
    onDestroy,
    onMount
  } from "svelte";
  import { MDCDialog } from "@material/dialog";
  
  const dispatch = createEventDispatcher();

  export let dialog = null;
  export let id = "my";
  export let scrollable = false;
  export let open = false;
  
  let mdcComponent;
  let status;
  /* TODO -- global components
  https://svelte.dev/repl/2e2fcca4c5c44d29b5817d93c60a33ec?version=3.4.4
  */
  onMount(() => {
    mdcComponent = new MDCDialog(dialog);
    mdcComponent.listen("MDCDialog:opening", () => {
      status = undefined;
      dispatch("opening");
    });
    mdcComponent.listen("MDCDialog:opened", () => {
      dispatch("opened");
    });
    mdcComponent.listen("MDCDialog:closing", (e) => {
      dispatch("closing", e.detail);
    });
    mdcComponent.listen("MDCDialog:closed", (e) => {
      status = e.detail.action;
      open = false;
      dispatch("closed", e.detail);
      console.log("closed", e.detail);
    });
  });

  let prevOpen;
  afterUpdate(() => {
    if (open != prevOpen && mdcComponent && open !== mdcComponent.isOpen) {
      if (open) {
        mdcComponent.open();
      } else {
        mdcComponent.close();
      }
    }
    prevOpen = open;
  });

  onDestroy(() => {
    mdcComponent.destroy();
  });

  export function show() {
    open = true;
  }

  export function getStatus() {
    return status;
  }
</script>

<div
  bind:this="{dialog}"
  id="{id}"
  class="mdc-dialog"
  role="alertdialog"
  aria-labelledby="{id}-label"
  aria-describedby="{id}-description">
  <div class="mdc-dialog__container">
    <div class="mdc-dialog__surface">
      <h2 id="{id}-label" class="mdc-dialog__title">
        <slot name="header"></slot>
      </h2>
      <section
        id="{id}-body"
        class="mdc-dialog__content{scrollable?'--scrollable':''}"
      >
        <slot name="body"></slot>
      </section>
      <footer class="mdc-dialog__actions">
        <slot name="footer"></slot>
      </footer>
    </div>
  </div>
  <div class="mdc-dialog__scrim"></div>
</div>

  