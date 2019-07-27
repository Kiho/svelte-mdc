<script>
  import { beforeUpdate, onDestroy, onMount } from "svelte";
  import { MDCTextField } from "@material/textfield";
  import { processClasses } from "../helpers";
  import { Icon } from "../Icon";
  import TextFieldCharacterCounter from './TextFieldCharacterCounter.svelte';

  export let placeholder = '';
  export let id;
  export let icon = '';
  export let iconMode = '';
  export let name = '';
  export let disabled = false;
  export let value;
  export let label = '';
  export let outlined = false;
  export let type = 'text';
  export let maxLength;
  export let helperText = '';
  export let invalid = false;
  export let characterCounter = false;
  export let min, max, step, pattern, required;
  // TextArea
  export let textarea = false;
  export let rows = 0;
  export let cols = 0;
  
  export let textField;

  const mdcAttrs = [
    "value",
    "min",
    "max",
    "step",
    "maxLength",
    "pattern",
    "required"
  ];

  const fieldAttrs = [
      "id",
      "name",
      "type",
      "helperText",
      "inputAttrs",
      "icon",
      "iconMode",
  ];
  
  let mdcComponent;
  onMount(() => {
    mdcComponent = MDCTextField.attachTo(textField);
    // mdcComponent = new MDCTextField(textField);
  });

  beforeUpdate(() => {    
    // console.log('icon', icon, iconMode);
    updateAttrs();
  });

  onDestroy(() => {
    mdcComponent.destroy();
  });

  function updateMdcAttrs() {
    console.log('update()');
    if (mdcComponent) {
      let result = Object.assign({}, $$props);
      for (let key of mdcAttrs) {
        if (result[key] != mdcComponent[key]) {
          console.log('result[key] != mdcComponent[key]', key, result[key], mdcComponent[key]);
          mdcComponent[key] = result[key];
        }
      }
    }
  }
  
  $: updateMdcAttrs(value, min, max, step, maxLength, pattern, required);

  // function invalidate() {
  //   console.log('invalidate()');
  //   mdcComponent.destroy();
  //   mdcComponent = MDCTextField.attachTo(textField);
  // }

  // $: helperText, outlined, label, iconMode, mdcComponent && invalidate();

  export let inputAttrs;
  function updateInputAttrs() {
    var result = {};
    if (helperText) {
      let elem = id + "-helper-text";
      result["aria-controls"] = elem;
      result["aria-describedby"] = elem;
    }
    result["maxlength"] = maxLength;    
    inputAttrs = result;
  }

  $: updateInputAttrs();

  export let attrs;
  function updateAttrs() { 
    let result = Object.assign({}, $$props);
    let cls = "mdc-text-field";
    let classes = [cls, "text-field"];
    for (let key of [
      "box",
      "dense",
      "fullwidth",
      "outlined",
      "disabled",
      "focused",
      "invalid"
    ]) {
      if (result[key]) {
        classes.push(cls + "--" + key);
      }
      delete result[key];
    }
    if (result.icon && result.iconMode) {
      classes.push(cls + "--with-" + result.iconMode + "-icon");
    }    
    for (let key of [
      "id",
      "name",
      "type",
      "helperText",
      "inputAttrs",
      "icon",
      "iconMode",
      ...mdcAttrs
    ]) {
      delete result[key];      
    }

    result["class"] = processClasses(classes, result["class"]);
    attrs = result;    
    console.log('attrs', attrs);
  }
</script>

<div bind:this="{textField}" {...attrs}>
  {#if icon && iconMode === "leading"}
  <Icon className="mdc-text-field__icon" tabindex="0" role="button">{icon}</Icon>
  {/if}
  {#if type === 'textarea'}
  <textarea
    id="{id}"
    name="{name}"
    class="mdc-text-field__input"
    disabled="{disabled}"
    rows="{rows}"
    cols="{cols}"
    {...inputAttrs}
  />
  {:else}
  <input
    type="text"
    id="{id}"
    name="{name}"
    class="mdc-text-field__input"
    disabled="{disabled}"
    {...inputAttrs}
  />
  {/if}
  {#if icon && iconMode === "trailing"}
  <Icon className="mdc-text-field__icon" tabindex="0" role="button">{icon}</Icon>
  {/if} {#if outlined}
    <div class="mdc-notched-outline">
      <div class="mdc-notched-outline__leading"></div>
      <div class="mdc-notched-outline__notch" style="">
        <label class="mdc-floating-label" style="">{label}</label>
      </div>
      <div class="mdc-notched-outline__trailing"></div>
    </div>
  {:else}
    {#if label}
    <label class="mdc-floating-label" for="{id}">{label}</label>
    {/if} 
    <div class="mdc-line-ripple"></div>
  {/if}
</div>
{#if helperText || (characterCounter && maxLength)}
  <div class="mdc-text-field-helper-line">
    <div
      aria-hidden="true"
      class="mdc-text-field-helper-text mdc-text-field-helper-text--persistent"
      class:mdc-text-field-helper-text--validation-msg={invalid}
    >
      {helperText}
    </div>
    {#if characterCounter}
      <TextFieldCharacterCounter />
    {/if}
  </div>
{/if}
