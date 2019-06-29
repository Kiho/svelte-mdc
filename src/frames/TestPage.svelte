<script>
  import { IconToggle } from '../components/IconButton';
  import { Checkbox } from '../components/Checkbox';
  export let name = '';
  export let iconToggle = false;
  export let ripple = false;

	function iconEvent(value) {
    console.log('IconToggle clicked', value);
  }
</script>

<IconToggle bind:ripple value="{iconToggle}" iconOn="favorite" iconOff="favorite_border" on:input="{(event)=>iconEvent(event.value)}" accent />
<Checkbox bind:checked={ripple} />