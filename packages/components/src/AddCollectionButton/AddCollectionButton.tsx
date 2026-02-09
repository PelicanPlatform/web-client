"use client";

import { useState, useRef, useEffect } from "react";
import { Box, IconButton, TextField, IconButtonProps, TextFieldProps, Collapse } from "@mui/material";

interface ExpandableIconButtonProps {
  /**
   * The icon to display when collapsed
   */
  icon: React.ReactNode;

  /**
   * Callback when the input value is submitted (e.g., on Enter key or blur)
   */
  onSubmit?: (value: string) => void;

  /**
   * Callback when the input value changes
   */
  onChange?: (value: string) => void;

  /**
   * Placeholder text for the input field
   */
  placeholder?: string;

  /**
   * Initial value for the input field
   */
  defaultValue?: string;

  /**
   * Props to pass to the IconButton
   */
  iconButtonProps?: Omit<IconButtonProps, 'onClick'>;

  /**
   * Props to pass to the TextField
   */
  textFieldProps?: Omit<TextFieldProps, 'value' | 'onChange' | 'onBlur' | 'onKeyDown'>;

  /**
   * Whether to auto-focus the input when expanded
   * @default true
   */
  autoFocus?: boolean;

  /**
   * Whether to collapse on blur
   * @default true
   */
  collapseOnBlur?: boolean;

  /**
   * Width of the expanded input field
   * @default 200
   */
  expandedWidth?: number | string;
}

/**
 * A button that starts as an icon and expands to an input field on click.
 * Useful for inline editing or adding items without cluttering the UI.
 */
const ExpandableIconButton = ({
                                icon,
                                onSubmit,
                                onChange,
                                placeholder = "Collection Name",
                                defaultValue = "",
                                iconButtonProps,
                                textFieldProps,
                                autoFocus = true,
                                collapseOnBlur = true,
                                expandedWidth = 200,
                              }: ExpandableIconButtonProps) => {
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded && autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded, autoFocus]);

  const handleIconClick = () => {
    setExpanded(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange?.(newValue);
  };

  const handleSubmit = () => {
    if (value.trim()) {
      onSubmit?.(value);
      setValue("");
    }
    setExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setValue(defaultValue);
      setExpanded(false);
    }
  };

  const handleBlur = () => {
    if (collapseOnBlur) {
      // Small delay to allow click events to fire first
      setTimeout(() => {
        if (value.trim()) {
          handleSubmit();
        } else {
          setValue(defaultValue);
          setExpanded(false);
        }
      }, 150);
    }
  };

  return (
    <Box display="flex" alignItems="center">
      {!expanded ? (
        <IconButton
          {...iconButtonProps}
          onClick={handleIconClick}
          aria-label={iconButtonProps?.['aria-label'] || "expand to input"}
        >
          {icon}
        </IconButton>
      ) : (
        <Collapse in={expanded} orientation="horizontal" timeout={200}>
          <TextField
            {...textFieldProps}
            inputRef={inputRef}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            size="small"
            variant="outlined"
            sx={{
              width: expandedWidth,
              ...textFieldProps?.sx,
            }}
          />
        </Collapse>
      )}
    </Box>
  );
};

export default ExpandableIconButton;
