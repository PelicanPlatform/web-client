import {InputAdornment, Box} from "@mui/material";
import {KeyboardDoubleArrowRight, KeyboardDoubleArrowLeft} from "@mui/icons-material";


interface StartAdornmentProps {
    federation?: string;
    namespace?: string;
    expanded: boolean;
    setExpanded: (expanded: boolean) => void;
}

const StartAdornment = ({federation, namespace, expanded, setExpanded}: StartAdornmentProps) => {
    return (
        <InputAdornment position="start">
            <Box
                sx={{ display: 'flex', transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 200ms ease' }}
                onClick={() => {
                    // Only allow toggling if both federation and namespace are defined
                    if(!!federation && !!namespace) {
                        setExpanded(!expanded)
                    }
                }}
            >
                <KeyboardDoubleArrowRight/>
            </Box>
        </InputAdornment>
    )
}

export default StartAdornment;
