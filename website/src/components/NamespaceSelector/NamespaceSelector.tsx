import { FormControl, InputLabel, MenuItem, Select, SelectChangeEvent } from "@mui/material";
import {Namespace} from "@/types"

interface NamespaceSelectorProps {
  value?: Namespace;
  onChange: (ns: Namespace) => void;
  data: Namespace[];
}

const NamespaceSelector = ({value, onChange, data}: NamespaceSelectorProps) => {
  const handleChange = (event: SelectChangeEvent<string>) => {
    const selected = (data ?? []).find((ns) => ns.path === event.target.value);
    if (selected) {
      onChange(selected);
    }
  };

  return (
    <FormControl fullWidth>
      <InputLabel>Select Namespace</InputLabel>
      <Select
        value={value?.path ?? ""}
        label="Select Namespace"
        onChange={handleChange}
      >
        {(data ?? []).map((ns) => (
          <MenuItem key={ns.path} value={ns.path}>
            {ns.path}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

export default NamespaceSelector;
