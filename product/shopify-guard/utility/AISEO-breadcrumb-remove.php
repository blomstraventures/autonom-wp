/**
 * Remove AIOSEO BreadcrumbList schema (nested inside WebPage graph)
 * Runs recursively to catch breadcrumbs at any depth.
 */
add_filter( 'aioseo_schema_output', 'autonom_remove_aioseo_breadcrumbs', 10, 1 );

function autonom_remove_aioseo_breadcrumbs( $graphs ) {
    if ( empty( $graphs ) || ! is_array( $graphs ) ) {
        return $graphs;
    }
    return autonom_recursive_remove_breadcrumbs( $graphs );
}

function autonom_recursive_remove_breadcrumbs( $data ) {
    if ( ! is_array( $data ) ) {
        return $data;
    }
    // Remove the whole node if it is a BreadcrumbList
    if ( isset( $data['@type'] ) && $data['@type'] === 'BreadcrumbList' ) {
        return null;
    }
    // Also catch when breadcrumb is a property (WebPage -> breadcrumb)
    if ( isset( $data['breadcrumb'] ) ) {
        unset( $data['breadcrumb'] );
    }
    // Recurse through every key
    $cleaned = array();
    foreach ( $data as $key => $value ) {
        $processed = autonom_recursive_remove_breadcrumbs( $value );
        if ( $processed !== null && $processed !== array() ) {
            $cleaned[ $key ] = $processed;
        }
    }
    return $cleaned;
}
