// Permission type
type Role = 'AGENT' | 'CHEF_SECTION' | 'ASSIST_CDS' | 'CHEF_SERVICE';
type Module = 'MODULE1' | 'MODULE2' | 'MODULE3' | 'MODULE4' | 'MODULE5' | 'MODULE6' | 'MODULE7' | 'MODULE8' 
              | 'MODULE9' | 'MODULE10' | 'MODULE11' | 'MODULE12' | 'MODULE13' | 'MODULE14' | 'MODULE15' | 'MODULE16';

interface PermissionsMatrix {
    [role: string]: {
        [module: string]: boolean;
    };
}

// Define the PERMISSIONS_MATRIX constant
const PERMISSIONS_MATRIX: PermissionsMatrix = {
    AGENT: {
        MODULE1: true,
        MODULE2: true,
        MODULE3: false,
        MODULE4: false,
        MODULE5: true,
        MODULE6: false,
        MODULE7: false,
        MODULE8: true,
        MODULE9: false,
        MODULE10: false,
        MODULE11: false,
        MODULE12: true,
        MODULE13: false,
        MODULE14: false,
        MODULE15: true,
        MODULE16: false,
    },
    CHEF_SECTION: {
        MODULE1: true,
        MODULE2: true,
        MODULE3: true,
        MODULE4: true,
        MODULE5: false,
        MODULE6: false,
        MODULE7: true,
        MODULE8: true,
        MODULE9: true,
        MODULE10: false,
        MODULE11: true,
        MODULE12: false,
        MODULE13: true,
        MODULE14: true,
        MODULE15: false,
        MODULE16: false,
    },
    ASSIST_CDS: {
        MODULE1: false,
        MODULE2: false,
        MODULE3: true,
        MODULE4: false,
        MODULE5: false,
        MODULE6: true,
        MODULE7: false,
        MODULE8: false,
        MODULE9: false,
        MODULE10: true,
        MODULE11: false,
        MODULE12: false,
        MODULE13: false,
        MODULE14: true,
        MODULE15: false,
        MODULE16: false,
    },
    CHEF_SERVICE: {
        MODULE1: true,
        MODULE2: false,
        MODULE3: true,
        MODULE4: false,
        MODULE5: true,
        MODULE6: true,
        MODULE7: true,
        MODULE8: false,
        MODULE9: true,
        MODULE10: true,
        MODULE11: false,
        MODULE12: true,
        MODULE13: true,
        MODULE14: false,
        MODULE15: true,
        MODULE16: false,
    },
};

// hasPermission function
function hasPermission(role: Role, module: Module): boolean {
    return PERMISSIONS_MATRIX[role][module] || false;
}

export { Role, Module, PERMISSIONS_MATRIX, hasPermission };