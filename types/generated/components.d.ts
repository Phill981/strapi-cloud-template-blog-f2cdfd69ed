import type { Schema, Struct } from '@strapi/strapi';

export interface SharedCommunityInfoBlocks extends Struct.ComponentSchema {
  collectionName: 'components_shared_community_info_blocks';
  info: {
    displayName: 'communityInfoBlocks';
  };
  attributes: {};
}

export interface SharedContentBlocks extends Struct.ComponentSchema {
  collectionName: 'components_shared_content_blocks';
  info: {
    displayName: 'contentBlocks';
  };
  attributes: {};
}

export interface SharedHelpCards extends Struct.ComponentSchema {
  collectionName: 'components_shared_help_cards';
  info: {
    displayName: 'helpCards';
  };
  attributes: {};
}

export interface SharedHowItWorksSteps extends Struct.ComponentSchema {
  collectionName: 'components_shared_how_it_works_steps';
  info: {
    displayName: 'howItWorksSteps';
  };
  attributes: {};
}

export interface SharedImpactState extends Struct.ComponentSchema {
  collectionName: 'components_shared_impact_states';
  info: {
    displayName: 'impactState';
  };
  attributes: {};
}

export interface SharedMedia extends Struct.ComponentSchema {
  collectionName: 'components_shared_media';
  info: {
    displayName: 'Media';
    icon: 'file-video';
  };
  attributes: {
    file: Schema.Attribute.Media<'images' | 'files' | 'videos'>;
  };
}

export interface SharedQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_quotes';
  info: {
    displayName: 'Quote';
    icon: 'indent';
  };
  attributes: {
    body: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface SharedRichText extends Struct.ComponentSchema {
  collectionName: 'components_shared_rich_texts';
  info: {
    description: '';
    displayName: 'Rich text';
    icon: 'align-justify';
  };
  attributes: {
    body: Schema.Attribute.RichText;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: '';
    displayName: 'Seo';
    icon: 'allergies';
    name: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

export interface SharedSlider extends Struct.ComponentSchema {
  collectionName: 'components_shared_sliders';
  info: {
    description: '';
    displayName: 'Slider';
    icon: 'address-book';
  };
  attributes: {
    files: Schema.Attribute.Media<'images', true>;
  };
}

export interface SharedWasMachtLegmonCards extends Struct.ComponentSchema {
  collectionName: 'components_shared_was_macht_legmon_cards';
  info: {
    displayName: 'wasMachtLegmonCards';
  };
  attributes: {};
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'shared.community-info-blocks': SharedCommunityInfoBlocks;
      'shared.content-blocks': SharedContentBlocks;
      'shared.help-cards': SharedHelpCards;
      'shared.how-it-works-steps': SharedHowItWorksSteps;
      'shared.impact-state': SharedImpactState;
      'shared.media': SharedMedia;
      'shared.quote': SharedQuote;
      'shared.rich-text': SharedRichText;
      'shared.seo': SharedSeo;
      'shared.slider': SharedSlider;
      'shared.was-macht-legmon-cards': SharedWasMachtLegmonCards;
    }
  }
}
