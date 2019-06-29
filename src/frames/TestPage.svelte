<script>
  import { IconToggle } from '../components/IconButton';
  export let name = '';
  export let iconToggle = false;

	function iconEvent(value) {
    console.log('IconToggle clicked', value);
  }
</script>

<IconToggle ripple value="{iconToggle}" iconOn="favorite" iconOff="favorite_border" on:input="{(event)=>iconEvent(event.value)}" accent />
